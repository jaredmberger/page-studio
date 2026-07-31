(() => {
  const preview = document.querySelector('#preview');
  const editor = document.querySelector('#code-editor');
  const workspace = document.querySelector('#workspace');
  const statusEl = document.querySelector('#status');
  if (!preview || !editor || !workspace) return;

  const NON_TARGET_ELEMENTS = new Set([
    'html','head','body','style','script','link','meta','base','title','noscript','template'
  ]);

  let mappedSource = '';
  let sourceMap = new Map();
  let parse5Promise = null;
  let renderingAnnotatedPreview = false;

  function status(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  function ensureParse5() {
    if (!parse5Promise) {
      parse5Promise = import('https://cdn.jsdelivr.net/npm/parse5@7.2.1/+esm').then((module) => {
        if (!module || typeof module.parse !== 'function') {
          throw new Error('parse5 browser module did not expose parse()');
        }
        return module;
      });
    }
    return parse5Promise;
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
      status('The preview is out of sync with the HTML source. Refresh the preview and select the element again.', true);
      return;
    }

    activateCodeView();
    const start = Math.max(0, entry.startOffset);
    const end = Math.max(start, entry.endOffset);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, end);

    requestAnimationFrame(() => {
      const before = editor.value.slice(0, start);
      const line = before.split('\n').length;
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
      editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
      editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
      status(`Located exact HTML <${entry.tagName}> opening tag at line ${line}.`);
    });
  }

  function findNode(node, tagName) {
    if (!node) return null;
    if (node.tagName === tagName) return node;
    for (const child of node.childNodes || []) {
      const found = findNode(child, tagName);
      if (found) return found;
    }
    return null;
  }

  function collectSourceEntries(node, entries = []) {
    if (!node) return entries;

    if (node.tagName && !NON_TARGET_ELEMENTS.has(node.tagName)) {
      const location = node.sourceCodeLocation?.startTag;
      if (location && Number.isInteger(location.startOffset) && Number.isInteger(location.endOffset)) {
        entries.push({
          tagName: node.tagName,
          startOffset: location.startOffset,
          endOffset: location.endOffset
        });
      }
    }

    for (const child of node.childNodes || []) collectSourceEntries(child, entries);
    return entries;
  }

  function insertAttributeAtTagEnd(source, endOffset, attribute) {
    let insertAt = endOffset - 1;
    while (insertAt > 0 && /\s/.test(source[insertAt - 1])) insertAt--;
    if (source[insertAt - 1] === '/') insertAt--;
    return source.slice(0, insertAt) + attribute + source.slice(insertAt);
  }

  function annotateSource(source, entries, htmlNode, baseHref) {
    const insertions = [];
    const nextMap = new Map();

    entries.forEach((entry, index) => {
      const id = `ps-${index + 1}`;
      nextMap.set(id, entry);
      insertions.push({
        offset: entry.endOffset,
        attribute: ` data-page-studio-source-id="${id}"`
      });
    });

    const htmlLocation = htmlNode?.sourceCodeLocation?.startTag;
    if (htmlLocation?.endOffset) {
      insertions.push({
        offset: htmlLocation.endOffset,
        attribute: ' data-page-studio-source-mapped="true"'
      });
    }

    let annotated = source;
    insertions.sort((a, b) => b.offset - a.offset).forEach((insertion) => {
      annotated = insertAttributeAtTagEnd(annotated, insertion.offset, insertion.attribute);
    });

    if (baseHref && !/<base\b/i.test(annotated)) {
      const safeBase = String(baseHref).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      if (/<head[\s>]/i.test(annotated)) {
        annotated = annotated.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBase}">`);
      }
    }

    return { annotated, nextMap };
  }

  async function mapCurrentPreview() {
    const source = editor.value;
    const liveDoc = preview.contentDocument;
    if (!source || !liveDoc?.documentElement) return;

    if (liveDoc.documentElement.hasAttribute('data-page-studio-source-mapped')) {
      renderingAnnotatedPreview = false;
      status(`Mapped ${sourceMap.size} preview elements directly to exact HTML opening tags.`);
      return;
    }

    if (renderingAnnotatedPreview) return;

    try {
      renderingAnnotatedPreview = true;
      status('Preparing an exact HTML-mapped preview…');

      const parse5 = await ensureParse5();
      const parsed = parse5.parse(source, { sourceCodeLocationInfo: true });
      const parsedHtml = findNode(parsed, 'html');
      const parsedBody = findNode(parsed, 'body');
      if (!parsedBody) throw new Error('No authored body element was found');

      const entries = collectSourceEntries(parsedBody);
      const baseHref = liveDoc.querySelector('base')?.href || '';
      const { annotated, nextMap } = annotateSource(source, entries, parsedHtml, baseHref);

      mappedSource = source;
      sourceMap = nextMap;
      preview.srcdoc = annotated;
    } catch (error) {
      console.error('Page Studio source-map error:', error);
      renderingAnnotatedPreview = false;
      mappedSource = '';
      sourceMap = new Map();
      status(`Exact HTML source mapping could not initialize: ${error?.message || 'unknown error'}`, true);
    }
  }

  function findMappedSourceId(target) {
    if (!target || target.nodeType !== 1) return '';
    return target.closest('[data-page-studio-source-id]')?.getAttribute('data-page-studio-source-id') || '';
  }

  preview.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(mapCurrentPreview));
  });

  editor.addEventListener('input', () => {
    mappedSource = '';
    sourceMap = new Map();
    renderingAnnotatedPreview = false;
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'page-studio-select') return;

    let sourceId = data.sourceId || '';
    if (!sourceId) {
      try {
        const target = preview.contentDocument?.querySelector(data.path || '');
        sourceId = findMappedSourceId(target);
      } catch {}
    }

    if (!sourceId) {
      status('That preview item was generated at runtime and has no authored HTML opening tag.', true);
      return;
    }

    jumpToSource(sourceMap.get(sourceId));
  });
})();
