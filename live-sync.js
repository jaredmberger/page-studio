(() => {
  const preview = document.querySelector('#preview');
  const codeEditor = document.querySelector('#code-editor');
  const workspace = document.querySelector('#workspace');
  const toggle = document.querySelector('#toggle-sync');
  const selectionStatus = document.querySelector('#selection-status');
  const diagnostics = document.querySelector('#sync-diagnostics');

  if (!preview || !codeEditor || !workspace || !toggle || !selectionStatus) return;

  let enabled = true;
  let cursorTimer = 0;
  let lastSource = '';
  let indexed = [];
  let lastSelectedPath = '';
  const ignored = new Set(['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'TITLE']);
  const stages = new Map();

  mark('parent-ready', true, 'Parent sync script loaded.');

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = `Selection Sync: ${enabled ? 'On' : 'Off'}`;
    selectionStatus.textContent = enabled
      ? 'Selection Sync is ready. Tap an element in Live view to jump to its HTML.'
      : 'Selection synchronization is paused.';
    postToPreview({ type: 'page-studio-sync-state', enabled });
    mark('toggle-state', true, `Selection Sync is ${enabled ? 'enabled' : 'disabled'}.`);
  });

  window.addEventListener('message', event => {
    if (event.source !== preview.contentWindow) return;
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;

    if (data.type === 'page-studio-diagnostic') {
      mark(data.stage || 'preview-event', data.ok !== false, data.detail || 'Preview reported activity.');
      return;
    }

    if (!enabled || data.type !== 'page-studio-select') return;
    mark('parent-message', true, `Parent received selection message for <${data.tag || 'element'}>.`);
    handlePreviewMessage(data);
  });

  preview.addEventListener('load', () => {
    lastSelectedPath = '';
    mark('iframe-load', true, 'Preview iframe load event fired.');
    postToPreview({ type: 'page-studio-sync-state', enabled });
    selectionStatus.textContent = enabled
      ? 'Selection Sync is ready. Tap an element in Live view to jump to its HTML.'
      : 'Selection synchronization is paused.';
  });

  codeEditor.addEventListener('click', queueCursorSync);
  codeEditor.addEventListener('keyup', queueCursorSync);
  codeEditor.addEventListener('select', queueCursorSync);
  codeEditor.addEventListener('input', () => {
    indexed = [];
    lastSource = '';
  });

  function handlePreviewMessage(data) {
    const match = findSourceMatchFromMessage(data);
    if (!match) {
      mark('source-match', false, `Message arrived, but <${data.tag || 'element'}> could not be matched to source.`);
      selectionStatus.textContent = `Selected <${data.tag || 'element'}>, but its source could not be located reliably.`;
      return;
    }

    mark('source-match', true, `Matched <${data.tag}> to lines ${lineAt(match.start)}–${lineAt(match.end)}.`);
    showSplitView();
    try { codeEditor.focus({ preventScroll: true }); } catch { codeEditor.focus(); }
    codeEditor.setSelectionRange(match.start, match.end);
    scrollEditorTo(match.start);
    lastSelectedPath = data.path || '';
    postToPreview({ type: 'page-studio-highlight', path: lastSelectedPath });
    selectionStatus.textContent = `Selected ${describeMessage(data)} · jumped to lines ${lineAt(match.start)}–${lineAt(match.end)}.`;
  }

  function queueCursorSync() {
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(syncCursorToPreview, 75);
  }

  function syncCursorToPreview() {
    if (!enabled) return;
    const match = matchAtPosition(codeEditor.selectionStart);
    if (!match) return;
    const path = match.path || '';
    if (path) postToPreview({ type: 'page-studio-highlight', path });
    selectionStatus.textContent = `Code cursor is inside <${match.tag}> · highlighted in Live view.`;
  }

  function findSourceMatchFromMessage(data) {
    const source = codeEditor.value;
    const tag = String(data.tag || '').toLowerCase();
    if (!tag || ignored.has(tag.toUpperCase())) return null;

    if (data.id) {
      const idPattern = new RegExp(`<${escapeRegex(tag)}\\b[^>]*\\bid=(['"])${escapeRegex(data.id)}\\1[^>]*>`, 'i');
      const hit = idPattern.exec(source);
      if (hit) return expandElementRange(source, hit.index, tag);
    }

    const text = normalizeText(data.text).slice(0, 90);
    if (text.length >= 8) {
      const snippet = text.slice(0, 45);
      const rawIndex = approximateRawIndex(source, snippet);
      if (rawIndex >= 0) {
        const openIndex = source.lastIndexOf(`<${tag}`, rawIndex);
        if (openIndex >= 0) return expandElementRange(source, openIndex, tag);
      }
    }

    const ordinal = pathOrdinal(data.path, tag);
    const candidates = sourceIndex().filter(item => item.tag === tag);
    if (ordinal >= 0 && candidates[ordinal]) return candidates[ordinal];
    return candidates[0] || null;
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
      const ordinal = counts.get(tag) || 0;
      counts.set(tag, ordinal + 1);
      indexed.push({ ...range, tag, ordinal, path: '' });
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

  function postToPreview(message) {
    try {
      preview.contentWindow?.postMessage(message, '*');
      mark('parent-send', true, `Parent sent “${message.type}” to preview.`);
    } catch (error) {
      mark('parent-send', false, `Parent could not message preview: ${error.message}`);
    }
  }

  function mark(key, ok, detail) {
    stages.set(key, { ok, detail, time: new Date().toLocaleTimeString() });
    if (!diagnostics) return;
    diagnostics.innerHTML = [...stages.values()].map(item =>
      `<div class="validation-item ${item.ok ? 'ok' : 'error'}"><strong>${item.ok ? '✓' : '✗'} ${escapeHtml(item.detail)}</strong><span>${escapeHtml(item.time)}</span></div>`
    ).join('');
  }

  function describeMessage(data) {
    const id = data.id ? `#${data.id}` : '';
    const text = normalizeText(data.text).slice(0, 42);
    return `<${data.tag || 'element'}${id}>${text ? ` “${text}${text.length === 42 ? '…' : ''}”` : ''}`;
  }

  function pathOrdinal(path, tag) {
    if (!path) return -1;
    const parts = String(path).split('>');
    const last = [...parts].reverse().find(part => part.startsWith(tag + ':nth-of-type('));
    if (!last) return -1;
    const value = Number(last.match(/nth-of-type\((\d+)\)/)?.[1] || 0);
    return value > 0 ? value - 1 : -1;
  }

  function lineAt(position) {
    return codeEditor.value.slice(0, position).split('\n').length;
  }

  function approximateRawIndex(source, snippet) {
    const lower = source.toLowerCase();
    const words = String(snippet || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return -1;
    return lower.indexOf(words[0]);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVoid(tag) {
    return ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();