(() => {
  const preview = document.querySelector('#preview');
  const codeEditor = document.querySelector('#code-editor');
  const workspace = document.querySelector('#workspace');
  const toggle = document.querySelector('#toggle-sync');
  const selectionStatus = document.querySelector('#selection-status');

  if (!preview || !codeEditor || !workspace || !toggle || !selectionStatus) return;

  let enabled = true;
  let lastElement = null;
  let cursorTimer = 0;
  let lastSource = '';
  let indexed = [];
  let inspectorCleanup = null;
  let lastTouchAt = 0;
  const ignored = new Set(['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'TITLE']);

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = `Selection Sync: ${enabled ? 'On' : 'Off'}`;
    if (!enabled) clearHighlight();
    selectionStatus.textContent = enabled
      ? 'Tap an element in Live view to jump to its HTML. Move the code cursor to highlight the matching element.'
      : 'Selection synchronization is paused.';
  });

  preview.addEventListener('load', installPreviewInspector);
  codeEditor.addEventListener('click', queueCursorSync);
  codeEditor.addEventListener('keyup', queueCursorSync);
  codeEditor.addEventListener('select', queueCursorSync);
  codeEditor.addEventListener('input', () => {
    indexed = [];
    lastSource = '';
  });

  function installPreviewInspector() {
    inspectorCleanup?.();
    inspectorCleanup = null;
    if (!enabled) return;
    const doc = getPreviewDocument();
    if (!doc) return;

    const style = doc.createElement('style');
    style.setAttribute('data-page-studio-sync', '');
    style.textContent = '[data-page-studio-selected]{outline:3px solid #d2b875!important;outline-offset:3px!important;box-shadow:0 0 0 5px rgba(7,16,15,.55)!important;cursor:pointer!important;touch-action:manipulation!important}';
    doc.head?.appendChild(style);

    const onTouchEnd = (event) => {
      lastTouchAt = Date.now();
      handlePreviewSelection(event);
    };
    const onClick = (event) => {
      if (Date.now() - lastTouchAt < 700) return;
      handlePreviewSelection(event);
    };
    const onPointerUp = (event) => {
      if (event.pointerType === 'touch') return;
      handlePreviewSelection(event);
    };
    const onTouchStart = suppressNavigation;
    const onPointerDown = suppressNavigation;

    doc.addEventListener('touchend', onTouchEnd, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    doc.addEventListener('pointerdown', onPointerDown, true);

    inspectorCleanup = () => {
      doc.removeEventListener('touchend', onTouchEnd, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('pointerup', onPointerUp, true);
      doc.removeEventListener('touchstart', onTouchStart, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      style.remove();
    };
  }

  function suppressNavigation(event) {
    if (!enabled) return;
    const target = event.target instanceof Element ? event.target.closest('a,button,input,select,textarea,label') : null;
    if (target && event.cancelable) event.preventDefault();
  }

  function handlePreviewSelection(event) {
    if (!enabled) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();

    const rawTarget = event.target instanceof Element
      ? event.target
      : event.changedTouches?.[0]
        ? getPreviewDocument()?.elementFromPoint(event.changedTouches[0].clientX, event.changedTouches[0].clientY)
        : null;
    const element = editableElement(rawTarget);
    if (!element) return;

    const match = findSourceMatch(element);
    highlight(element);

    if (!match) {
      selectionStatus.textContent = `Selected ${describeElement(element)}, but its source could not be located reliably.`;
      return;
    }

    showSplitView();
    try { codeEditor.focus({ preventScroll: true }); } catch { codeEditor.focus(); }
    codeEditor.setSelectionRange(match.start, match.end);
    scrollEditorTo(match.start);
    selectionStatus.textContent = `Selected ${describeElement(element)} · jumped to lines ${lineAt(match.start)}–${lineAt(match.end)}.`;
  }

  function queueCursorSync() {
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(syncCursorToPreview, 75);
  }

  function syncCursorToPreview() {
    if (!enabled) return;
    const doc = getPreviewDocument();
    if (!doc) return;

    const match = matchAtPosition(codeEditor.selectionStart);
    if (!match) return;

    const element = findPreviewElement(doc, match);
    if (!element) return;

    highlight(element);
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    selectionStatus.textContent = `Code cursor is inside ${describeElement(element)} · highlighted in Live view.`;
  }

  function editableElement(target) {
    let element = target instanceof Element ? target : target?.parentElement;
    while (element && ignored.has(element.tagName)) element = element.parentElement;
    return element || null;
  }

  function findSourceMatch(element) {
    const source = codeEditor.value;
    const id = element.id;
    if (id) {
      const idPattern = new RegExp(`<${element.tagName.toLowerCase()}\\b[^>]*\\bid=(['"])${escapeRegex(id)}\\1[^>]*>`, 'i');
      const hit = idPattern.exec(source);
      if (hit) return expandElementRange(source, hit.index, element.tagName.toLowerCase());
    }

    for (const attr of ['data-page-studio-key', 'data-record-id', 'data-section', 'data-view', 'aria-labelledby']) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const pattern = new RegExp(`<${element.tagName.toLowerCase()}\\b[^>]*\\b${escapeRegex(attr)}=(['"])${escapeRegex(value)}\\1[^>]*>`, 'i');
      const hit = pattern.exec(source);
      if (hit) return expandElementRange(source, hit.index, element.tagName.toLowerCase());
    }

    const text = normalizeText(element.textContent).slice(0, 90);
    if (text.length >= 8) {
      const snippet = text.slice(0, 45);
      const textIndex = normalizeText(source).indexOf(snippet);
      if (textIndex >= 0) {
        const rawIndex = approximateRawIndex(source, snippet);
        const openIndex = source.lastIndexOf(`<${element.tagName.toLowerCase()}`, rawIndex);
        if (openIndex >= 0) return expandElementRange(source, openIndex, element.tagName.toLowerCase());
      }
    }

    const candidates = sourceIndex().filter(item => item.tag === element.tagName.toLowerCase());
    const siblings = [...element.parentElement?.children || []].filter(item => item.tagName === element.tagName);
    const ordinal = siblings.indexOf(element);
    if (ordinal >= 0 && candidates[ordinal]) return candidates[ordinal];
    return null;
  }

  function findPreviewElement(doc, match) {
    if (match.id) return doc.getElementById(match.id);
    if (match.attr && match.value) {
      try { return doc.querySelector(`${match.tag}[${CSS.escape(match.attr)}="${CSS.escape(match.value)}"]`); } catch {}
    }

    const elements = [...doc.querySelectorAll(match.tag)].filter(el => !ignored.has(el.tagName));
    if (!elements.length) return null;
    if (match.text) {
      const exact = elements.find(el => normalizeText(el.textContent).startsWith(match.text));
      if (exact) return exact;
    }
    return elements[Math.min(match.ordinal || 0, elements.length - 1)] || null;
  }

  function matchAtPosition(position) {
    const items = sourceIndex().filter(item => item.start <= position && item.end >= position);
    if (!items.length) return null;
    return items.sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  }

  function sourceIndex() {
    const source = codeEditor.value;
    if (source === lastSource && indexed.length) return indexed;
    lastSource = source;
    indexed = [];

    const openTag = /<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi;
    let match;
    const counts = new Map();
    while ((match = openTag.exec(source))) {
      const tag = match[1].toLowerCase();
      if (ignored.has(tag.toUpperCase()) || match[0].startsWith('</') || /\/>$/.test(match[0])) continue;
      const range = expandElementRange(source, match.index, tag);
      const attrs = match[2] || '';
      const id = attributeValue(attrs, 'id');
      const preferredAttr = ['data-page-studio-key', 'data-record-id', 'data-section', 'data-view', 'aria-labelledby'].find(name => attributeValue(attrs, name));
      const value = preferredAttr ? attributeValue(attrs, preferredAttr) : '';
      const text = normalizeText(stripTags(source.slice(match.index + match[0].length, Math.min(range.end, match.index + match[0].length + 220)))).slice(0, 45);
      const ordinal = counts.get(tag) || 0;
      counts.set(tag, ordinal + 1);
      indexed.push({ ...range, tag, id, attr: preferredAttr || '', value, text, ordinal });
    }
    return indexed;
  }

  function expandElementRange(source, start, tag) {
    const openEnd = source.indexOf('>', start);
    if (openEnd < 0) return { start, end: Math.min(source.length, start + tag.length + 2), tag };
    if (isVoid(tag) || source[openEnd - 1] === '/') return { start, end: openEnd + 1, tag };

    const tokenPattern = new RegExp(`<\\/?${escapeRegex(tag)}\\b[^>]*>`, 'gi');
    tokenPattern.lastIndex = start;
    let depth = 0;
    let token;
    while ((token = tokenPattern.exec(source))) {
      if (token.index < start) continue;
      if (token[0].startsWith('</')) depth--;
      else if (!token[0].endsWith('/>')) depth++;
      if (depth === 0) return { start, end: tokenPattern.lastIndex, tag };
    }
    return { start, end: openEnd + 1, tag };
  }

  function highlight(element) {
    clearHighlight();
    lastElement = element;
    element.setAttribute('data-page-studio-selected', '');
  }

  function clearHighlight() {
    try { lastElement?.removeAttribute('data-page-studio-selected'); } catch {}
    lastElement = null;
  }

  function showSplitView() {
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === 'split';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    workspace.className = 'workspace view-split';
  }

  function scrollEditorTo(position) {
    const before = codeEditor.value.slice(0, position);
    const line = before.split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(codeEditor).lineHeight) || 21;
    codeEditor.scrollTop = Math.max(0, line * lineHeight - codeEditor.clientHeight * 0.35);
  }

  function describeElement(element) {
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].slice(0, 2).map(name => `.${name}`).join('');
    const text = normalizeText(element.textContent).slice(0, 42);
    return `<${element.tagName.toLowerCase()}${id}${classes}>${text ? ` “${text}${text.length === 42 ? '…' : ''}”` : ''}`;
  }

  function getPreviewDocument() {
    try { return preview.contentDocument || preview.contentWindow?.document || null; } catch { return null; }
  }

  function lineAt(position) {
    return codeEditor.value.slice(0, position).split('\n').length;
  }

  function attributeValue(attrs, name) {
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\s*=\\s*(['"])(.*?)\\1`, 'i');
    return pattern.exec(attrs)?.[2] || '';
  }

  function approximateRawIndex(source, snippet) {
    const lower = source.toLowerCase();
    const words = snippet.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return -1;
    return lower.indexOf(words[0]);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stripTags(value) {
    return value.replace(/<[^>]*>/g, ' ');
  }

  function isVoid(tag) {
    return ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
})();