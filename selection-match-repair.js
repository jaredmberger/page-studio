(() => {
  const preview = document.querySelector('#preview');
  const codeEditor = document.querySelector('#code-editor');
  const workspace = document.querySelector('#workspace');
  const selectionStatus = document.querySelector('#selection-status');
  const diagnostics = document.querySelector('#sync-diagnostics');
  if (!preview || !codeEditor || !workspace || !selectionStatus) return;

  window.addEventListener('message', event => {
    if (event.source !== preview.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'page-studio-select' || !data.path || !data.tag) return;

    const source = codeEditor.value;
    const doc = new DOMParser().parseFromString(source, 'text/html');
    let target;
    try { target = doc.querySelector(data.path); } catch { target = null; }
    if (!target) return;

    const tag = String(data.tag).toLowerCase();
    const ordinal = [...doc.querySelectorAll(tag)].indexOf(target);
    if (ordinal < 0) return;

    const match = sourceRangesForTag(source, tag)[ordinal];
    if (!match) return;

    queueMicrotask(() => {
      document.querySelectorAll('[data-view]').forEach(button => {
        const active = button.dataset.view === 'split';
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      workspace.className = 'workspace view-split';
      try { codeEditor.focus({ preventScroll: true }); } catch { codeEditor.focus(); }
      codeEditor.setSelectionRange(match.start, match.end);
      const line = source.slice(0, match.start).split('\n').length;
      const endLine = source.slice(0, match.end).split('\n').length;
      const lineHeight = parseFloat(getComputedStyle(codeEditor).lineHeight) || 21;
      codeEditor.scrollTop = Math.max(0, (line - 1) * lineHeight - codeEditor.clientHeight * 0.35);
      selectionStatus.textContent = `Selected <${tag}> by exact document position · jumped to lines ${line}–${endLine}.`;
      mark(`Exact structural match: <${tag}> occurrence ${ordinal + 1}.`);
    });
  });

  function sourceRangesForTag(source, tag) {
    const results = [];
    const openTag = new RegExp(`<${escapeRegex(tag)}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
    let hit;
    while ((hit = openTag.exec(source))) results.push(expandElementRange(source, hit.index, tag));
    return results;
  }

  function expandElementRange(source, start, tag) {
    const openEnd = source.indexOf('>', start);
    if (openEnd < 0) return { start, end: Math.min(source.length, start + tag.length + 2) };
    if (isVoid(tag) || source[openEnd - 1] === '/') return { start, end: openEnd + 1 };
    const tokenPattern = new RegExp(`<\\/?${escapeRegex(tag)}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
    tokenPattern.lastIndex = start;
    let depth = 0;
    let token;
    while ((token = tokenPattern.exec(source))) {
      if (token[0].startsWith('</')) depth--;
      else if (!token[0].endsWith('/>')) depth++;
      if (depth === 0) return { start, end: tokenPattern.lastIndex };
    }
    return { start, end: openEnd + 1 };
  }

  function isVoid(tag) {
    return ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function mark(detail) {
    if (!diagnostics) return;
    const item = document.createElement('div');
    item.className = 'validation-item ok';
    item.innerHTML = `<strong>✓ ${escapeHtml(detail)}</strong><span>${new Date().toLocaleTimeString()}</span>`;
    diagnostics.appendChild(item);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();