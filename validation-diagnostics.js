(() => {
  const editor = document.querySelector('#code-editor');
  const validationList = document.querySelector('#validation-list');
  const review = document.querySelector('.publish-review');
  const publishSummary = document.querySelector('[data-publish-summary]');
  if (!editor || !validationList) return;

  const style = document.createElement('style');
  style.textContent = `
    .validation-diagnostics{margin-top:.55rem;display:grid;gap:.45rem}
    .validation-diagnostic{display:grid;gap:.2rem;padding:.55rem .65rem;border:1px solid rgba(191,164,106,.24);border-radius:.55rem;background:rgba(255,255,255,.025)}
    .validation-diagnostic__meta{font-size:.78rem;opacity:.72}
    .validation-diagnostic__code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.86}
    .validation-jump{justify-self:start;margin-top:.1rem;padding:.35rem .55rem;font-size:.78rem}
    .publish-validation-details{margin-top:.8rem;padding:.75rem;border:1px solid rgba(191,164,106,.28);border-radius:.65rem;background:rgba(255,255,255,.025)}
    .publish-validation-details h4{margin:0 0 .55rem}
    .publish-validation-details .validation-diagnostic{margin-top:.45rem}
  `;
  document.head.appendChild(style);

  function lineForIndex(source, index) {
    if (index < 0) return null;
    return source.slice(0, index).split('\n').length;
  }

  function snippetAt(source, index) {
    if (index < 0) return '';
    const start = source.lastIndexOf('\n', index) + 1;
    const endPos = source.indexOf('\n', index);
    const end = endPos === -1 ? source.length : endPos;
    return source.slice(start, end).trim().slice(0, 180);
  }

  function findAll(source, regex) {
    const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
    const re = new RegExp(regex.source, flags);
    const matches = [];
    let match;
    while ((match = re.exec(source))) {
      matches.push({ index: match.index, text: match[0], match });
      if (match[0] === '') re.lastIndex += 1;
    }
    return matches;
  }

  function diagnosticsFor(title) {
    const source = editor.value || '';
    const diagnostics = [];

    const addMatches = (matches, message) => matches.forEach((entry) => {
      diagnostics.push({
        line: lineForIndex(source, entry.index),
        index: entry.index,
        message,
        snippet: snippetAt(source, entry.index)
      });
    });

    if (/missing title/i.test(title)) {
      const head = source.search(/<head\b[^>]*>/i);
      diagnostics.push({
        line: head >= 0 ? lineForIndex(source, head) : 1,
        index: Math.max(head, 0),
        message: head >= 0 ? 'Add a <title> element inside <head>.' : 'Add a <head> section containing a <title> element.',
        snippet: head >= 0 ? snippetAt(source, head) : source.split('\n')[0] || ''
      });
    } else if (/\b0 H1 headings\b/i.test(title)) {
      const body = source.search(/<body\b[^>]*>/i);
      diagnostics.push({
        line: body >= 0 ? lineForIndex(source, body) : 1,
        index: Math.max(body, 0),
        message: 'Add the page’s primary <h1> within the document body.',
        snippet: body >= 0 ? snippetAt(source, body) : source.split('\n')[0] || ''
      });
    } else if (/\b\d+ H1 headings\b/i.test(title)) {
      addMatches(findAll(source, /<h1\b[^>]*>/gi), 'H1 found here. Keep one primary H1 and demote any secondary headings if appropriate.');
    } else if (/images? missing alt/i.test(title)) {
      addMatches(
        findAll(source, /<img\b(?![^>]*\balt\s*=)[^>]*>/gi),
        'This image is missing an alt attribute.'
      );
    } else if (/empty alt attribute/i.test(title)) {
      addMatches(
        findAll(source, /<img\b[^>]*\balt\s*=\s*(?:"\s*"|'\s*'|[^\s>]+)[^>]*>/gi).filter((entry) => /\balt\s*=\s*(?:"\s*"|'\s*')/i.test(entry.text)),
        'This image has an empty alt attribute. Confirm it is intentionally decorative.'
      );
    } else if (/external tab links?.*hardening/i.test(title)) {
      findAll(source, /<a\b[^>]*\btarget\s*=\s*(["'])_blank\1[^>]*>/gi).forEach((entry) => {
        const relMatch = entry.text.match(/\brel\s*=\s*(["'])(.*?)\1/i);
        const rel = relMatch ? relMatch[2].toLowerCase() : '';
        if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
          diagnostics.push({
            line: lineForIndex(source, entry.index),
            index: entry.index,
            message: 'Add rel="noopener noreferrer" to this target="_blank" link.',
            snippet: snippetAt(source, entry.index)
          });
        }
      });
    } else if (/invalid JSON-LD/i.test(title)) {
      const blocks = findAll(source, /<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>[\s\S]*?<\/script>/gi);
      blocks.forEach((entry) => {
        const openEnd = entry.text.indexOf('>');
        const closeStart = entry.text.toLowerCase().lastIndexOf('</script>');
        const json = entry.text.slice(openEnd + 1, closeStart);
        try {
          JSON.parse(json);
        } catch (error) {
          let index = entry.index;
          const positionMatch = String(error.message || '').match(/position\s+(\d+)/i);
          if (positionMatch) index = entry.index + openEnd + 1 + Number(positionMatch[1]);
          diagnostics.push({
            line: lineForIndex(source, index),
            index,
            message: `JSON-LD syntax error: ${error.message || 'Invalid JSON syntax.'}`,
            snippet: snippetAt(source, index)
          });
        }
      });
    } else if (/long title/i.test(title) || /title present/i.test(title)) {
      addMatches(findAll(source, /<title\b[^>]*>/gi).slice(0, 1), 'The page title is defined here.');
    } else if (/meta description/i.test(title)) {
      const matches = findAll(source, /<meta\b[^>]*\bname\s*=\s*(["'])description\1[^>]*>/gi);
      if (matches.length) addMatches(matches.slice(0, 1), 'The meta description is defined here.');
      else {
        const head = source.search(/<head\b[^>]*>/i);
        diagnostics.push({ line: head >= 0 ? lineForIndex(source, head) : 1, index: Math.max(head, 0), message: 'Add a meta description inside <head>.', snippet: head >= 0 ? snippetAt(source, head) : '' });
      }
    } else if (/canonical/i.test(title)) {
      const matches = findAll(source, /<link\b[^>]*\brel\s*=\s*(["'])canonical\1[^>]*>/gi);
      if (matches.length) addMatches(matches.slice(0, 1), 'The canonical link is defined here.');
      else {
        const head = source.search(/<head\b[^>]*>/i);
        diagnostics.push({ line: head >= 0 ? lineForIndex(source, head) : 1, index: Math.max(head, 0), message: 'Add a canonical <link> inside <head>.', snippet: head >= 0 ? snippetAt(source, head) : '' });
      }
    }

    return diagnostics;
  }

  function jumpTo(index, line) {
    const codeButton = document.querySelector('[data-view="code"]');
    codeButton?.click();
    editor.focus({ preventScroll: true });
    const start = Math.max(0, Number(index) || 0);
    editor.setSelectionRange(start, start);
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    editor.scrollTop = Math.max(0, ((Number(line) || 1) - 3) * lineHeight);
    editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function diagnosticMarkup(diag) {
    const lineLabel = diag.line ? `Line ${diag.line}` : 'Location unavailable';
    return `
      <div class="validation-diagnostic" data-validation-index="${Number(diag.index) || 0}" data-validation-line="${Number(diag.line) || 1}">
        <strong>${escapeHtml(diag.message)}</strong>
        <span class="validation-diagnostic__meta">${escapeHtml(lineLabel)}</span>
        ${diag.snippet ? `<code class="validation-diagnostic__code">${escapeHtml(diag.snippet)}</code>` : ''}
        <button type="button" class="validation-action validation-jump" data-jump-validation>Go to line ${Number(diag.line) || 1}</button>
      </div>`;
  }

  function enhanceValidationList() {
    validationList.querySelectorAll('.validation-item').forEach((item) => {
      item.querySelector('.validation-diagnostics')?.remove();
      const title = item.querySelector('strong')?.textContent?.trim() || '';
      if (!title) return;
      const diagnostics = diagnosticsFor(title);
      if (!diagnostics.length) return;
      const wrap = document.createElement('div');
      wrap.className = 'validation-diagnostics';
      wrap.innerHTML = diagnostics.map(diagnosticMarkup).join('');
      item.appendChild(wrap);
    });
  }

  function renderPublishDiagnostics() {
    if (!publishSummary) return;
    publishSummary.querySelector('.publish-validation-details')?.remove();
    const errors = [...validationList.querySelectorAll('.validation-item.error')];
    if (!errors.length) return;

    const box = document.createElement('section');
    box.className = 'publish-validation-details';
    const diagnostics = [];
    errors.forEach((item) => {
      const title = item.querySelector('strong')?.textContent?.trim() || 'Validation issue';
      const detail = [...item.children].find((child) => child.tagName === 'SPAN')?.textContent?.trim() || '';
      const found = diagnosticsFor(title);
      if (found.length) found.forEach((diag) => diagnostics.push({ ...diag, title, detail }));
      else diagnostics.push({ title, detail, line: null, index: 0, message: detail || title, snippet: '' });
    });

    box.innerHTML = `<h4>Validation issues to fix</h4>${diagnostics.map((diag) => `
      <div class="validation-diagnostic" data-validation-index="${Number(diag.index) || 0}" data-validation-line="${Number(diag.line) || 1}">
        <strong>${escapeHtml(diag.title)}</strong>
        <span>${escapeHtml(diag.message)}</span>
        <span class="validation-diagnostic__meta">${diag.line ? `Line ${diag.line}` : 'No exact line available'}</span>
        ${diag.snippet ? `<code class="validation-diagnostic__code">${escapeHtml(diag.snippet)}</code>` : ''}
        ${diag.line ? `<button type="button" class="validation-action validation-jump" data-jump-validation>Go to line ${diag.line}</button>` : ''}
      </div>`).join('')}`;
    publishSummary.appendChild(box);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-jump-validation]');
    if (!button) return;
    const diagnostic = button.closest('[data-validation-index]');
    jumpTo(diagnostic?.dataset.validationIndex, diagnostic?.dataset.validationLine);
  });

  const validationObserver = new MutationObserver(() => {
    requestAnimationFrame(() => {
      enhanceValidationList();
      if (review && !review.hidden) renderPublishDiagnostics();
    });
  });
  validationObserver.observe(validationList, { childList: true, subtree: false });

  if (publishSummary) {
    const publishObserver = new MutationObserver(() => {
      if (review && !review.hidden) requestAnimationFrame(renderPublishDiagnostics);
    });
    publishObserver.observe(publishSummary, { childList: true, subtree: false });
  }

  editor.addEventListener('input', () => requestAnimationFrame(enhanceValidationList));
  document.querySelector('#review-publish')?.addEventListener('click', () => setTimeout(renderPublishDiagnostics, 0));

  enhanceValidationList();
})();
