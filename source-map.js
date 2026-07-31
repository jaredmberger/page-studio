(() => {
  const preview = document.querySelector('#preview');
  const editor = document.querySelector('#code-editor');
  const workspace = document.querySelector('#workspace');
  const statusEl = document.querySelector('#status');
  if (!preview || !editor || !workspace) return;

  const VOID_ELEMENTS = new Set([
    'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'
  ]);
  const RAW_TEXT_ELEMENTS = new Set(['script','style','textarea','title']);
  let sourceMap = new Map();
  let mappedSource = '';
  let refreshToken = 0;

  function status(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  function buildExactSourceMap(source) {
    const map = new Map();
    const stack = [];
    const lower = source.toLowerCase();
    let output = '';
    let cursor = 0;
    let index = 0;

    while (cursor < source.length) {
      const lt = source.indexOf('<', cursor);
      if (lt === -1) {
        output += source.slice(cursor);
        break;
      }
      output += source.slice(cursor, lt);

      if (source.startsWith('<!--', lt)) {
        const end = source.indexOf('-->', lt + 4);
        const next = end === -1 ? source.length : end + 3;
        output += source.slice(lt, next);
        cursor = next;
        continue;
      }
      if (source.startsWith('<![CDATA[', lt)) {
        const end = source.indexOf(']]>', lt + 9);
        const next = end === -1 ? source.length : end + 3;
        output += source.slice(lt, next);
        cursor = next;
        continue;
      }
      if (/^<!doctype\b/i.test(source.slice(lt, lt + 20)) || source.startsWith('<?', lt) || source.startsWith('<!', lt)) {
        const end = source.indexOf('>', lt + 2);
        const next = end === -1 ? source.length : end + 1;
        output += source.slice(lt, next);
        cursor = next;
        continue;
      }

      const tagEnd = findTagEnd(source, lt + 1);
      if (tagEnd === -1) {
        output += source.slice(lt);
        break;
      }
      const rawTag = source.slice(lt, tagEnd + 1);
      const closeMatch = rawTag.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)/);
      if (closeMatch) {
        const tagName = closeMatch[1].toLowerCase();
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tagName === tagName) {
            const item = stack.splice(i, 1)[0];
            const entry = map.get(item.id);
            if (entry) entry.end = tagEnd + 1;
            break;
          }
        }
        output += rawTag;
        cursor = tagEnd + 1;
        continue;
      }

      const openMatch = rawTag.match(/^<\s*([a-zA-Z][\w:-]*)/);
      if (!openMatch) {
        output += rawTag;
        cursor = tagEnd + 1;
        continue;
      }

      const tagName = openMatch[1].toLowerCase();
      const selfClosing = /\/\s*>$/.test(rawTag) || VOID_ELEMENTS.has(tagName);
      const id = `ps-${++index}`;
      const injected = injectAttribute(rawTag, ` data-page-studio-source-id="${id}"`);
      map.set(id, { id, tagName, start: lt, openEnd: tagEnd + 1, end: selfClosing ? tagEnd + 1 : null });
      output += injected;
      cursor = tagEnd + 1;

      if (!selfClosing) {
        stack.push({ id, tagName });
        if (RAW_TEXT_ELEMENTS.has(tagName)) {
          const closeStart = lower.indexOf(`</${tagName}`, cursor);
          if (closeStart !== -1) {
            output += source.slice(cursor, closeStart);
            const rawEnd = findTagEnd(source, closeStart + 2);
            if (rawEnd !== -1) {
              output += source.slice(closeStart, rawEnd + 1);
              const entry = map.get(id);
              if (entry) entry.end = rawEnd + 1;
              stack.pop();
              cursor = rawEnd + 1;
            }
          }
        }
      }
    }

    for (const item of stack) {
      const entry = map.get(item.id);
      if (entry && entry.end == null) entry.end = source.length;
    }
    return { html: output, map };
  }

  function findTagEnd(source, start) {
    let quote = '';
    for (let i = start; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote && source[i - 1] !== '\\') quote = '';
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '>') return i;
    }
    return -1;
  }

  function injectAttribute(rawTag, attribute) {
    const closeIndex = rawTag.lastIndexOf('>');
    if (closeIndex < 0) return rawTag;
    const slashIndex = rawTag.lastIndexOf('/>', closeIndex);
    if (slashIndex >= 0) return rawTag.slice(0, slashIndex) + attribute + rawTag.slice(slashIndex);
    return rawTag.slice(0, closeIndex) + attribute + rawTag.slice(closeIndex);
  }

  function activateCodeView() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === 'split';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    workspace.className = 'workspace view-split';
  }

  function jumpToSource(entry) {
    if (!entry || editor.value !== mappedSource) {
      status('The page changed after the preview was rendered. Refreshing the preview before locating the element.', true);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    activateCodeView();
    const start = Math.max(0, entry.start);
    const end = Math.max(start, entry.openEnd);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, end);
    requestAnimationFrame(() => {
      const before = editor.value.slice(0, start);
      const line = before.split('\n').length;
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
      editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
      editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      status(`Located exact <${entry.tagName}> source at line ${line}.`);
    });
  }

  function mapCurrentPreview() {
    const source = editor.value;
    const token = ++refreshToken;
    const result = buildExactSourceMap(source);
    mappedSource = source;
    sourceMap = result.map;

    const doc = preview.contentDocument;
    if (!doc || token !== refreshToken) return;
    const mappedDoc = new DOMParser().parseFromString(result.html, 'text/html');
    const mappedElements = mappedDoc.querySelectorAll('[data-page-studio-source-id]');
    const liveElements = doc.querySelectorAll('*');
    if (!mappedElements.length || !liveElements.length) return;

    const count = Math.min(mappedElements.length, liveElements.length);
    for (let i = 0; i < count; i++) {
      const id = mappedElements[i].getAttribute('data-page-studio-source-id');
      if (id) liveElements[i].setAttribute('data-page-studio-source-id', id);
    }
  }

  preview.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(mapCurrentPreview));
  });

  editor.addEventListener('input', () => {
    mappedSource = '';
    sourceMap = new Map();
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'page-studio-select') return;
    let sourceId = data.sourceId || '';
    if (!sourceId) {
      try {
        const target = preview.contentDocument?.querySelector(data.path || '');
        sourceId = target?.getAttribute('data-page-studio-source-id') || '';
      } catch {}
    }
    if (!sourceId) return;
    jumpToSource(sourceMap.get(sourceId));
  });
})();
