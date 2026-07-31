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

  function status(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  function ensureParse5() {
    if (window.parse5) return Promise.resolve(window.parse5);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-page-studio-parse5]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.parse5), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/parse5@7.2.1/dist/cjs/index.min.js';
      script.async = true;
      script.dataset.pageStudioParse5 = 'true';
      script.onload = () => window.parse5 ? resolve(window.parse5) : reject(new Error('parse5 failed to initialize'));
      script.onerror = reject;
      document.head.appendChild(script);
    });
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
      status(`Located exact HTML <${entry.tagName}> source at line ${line}.`);
    });
  }

  function getElementChildren(node) {
    return (node.childNodes || []).filter((child) => child.tagName);
  }

  function findBodyNode(node) {
    if (!node) return null;
    if (node.tagName === 'body') return node;
    for (const child of node.childNodes || []) {
      const found = findBodyNode(child);
      if (found) return found;
    }
    return null;
  }

  function collectSourceEntries(node, path = [], entries = []) {
    if (!node) return entries;

    if (node.tagName && !NON_TARGET_ELEMENTS.has(node.tagName)) {
      const location = node.sourceCodeLocation?.startTag;
      if (location && Number.isInteger(location.startOffset) && Number.isInteger(location.endOffset)) {
        entries.push({
          path: path.join('.'),
          tagName: node.tagName,
          startOffset: location.startOffset,
          endOffset: location.endOffset
        });
      }
    }

    const children = getElementChildren(node);
    children.forEach((child, index) => collectSourceEntries(child, [...path, index], entries));
    return entries;
  }

  function getLiveElementByPath(root, path) {
    if (!path) return null;
    const indexes = path.split('.').map((value) => Number(value));
    let current = root;
    for (const index of indexes) {
      const children = Array.from(current.children || []);
      current = children[index];
      if (!current) return null;
    }
    return current;
  }

  async function mapCurrentPreview() {
    const source = editor.value;
    const liveDoc = preview.contentDocument;
    if (!source || !liveDoc?.body) return;

    try {
      const parse5 = await ensureParse5();
      const parsed = parse5.parse(source, { sourceCodeLocationInfo: true });
      const parsedBody = findBodyNode(parsed);
      if (!parsedBody) {
        status('Could not find a body element in the HTML source.', true);
        return;
      }

      const entries = collectSourceEntries(parsedBody);
      const nextMap = new Map();

      liveDoc.body.querySelectorAll('[data-page-studio-source-id]').forEach((element) => {
        element.removeAttribute('data-page-studio-source-id');
      });

      entries.forEach((entry, index) => {
        const liveElement = getLiveElementByPath(liveDoc.body, entry.path);
        if (!liveElement) return;
        if (liveElement.tagName.toLowerCase() !== entry.tagName) return;
        const id = `ps-${index + 1}`;
        liveElement.setAttribute('data-page-studio-source-id', id);
        nextMap.set(id, entry);
      });

      mappedSource = source;
      sourceMap = nextMap;
      status(`Mapped ${nextMap.size} live elements to exact HTML source locations.`);
    } catch (error) {
      console.error('Page Studio source-map error:', error);
      mappedSource = '';
      sourceMap = new Map();
      status('Exact HTML source mapping could not initialize.', true);
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

    if (!sourceId) {
      status('That preview item does not correspond to editable body HTML.', true);
      return;
    }

    jumpToSource(sourceMap.get(sourceId));
  });
})();
