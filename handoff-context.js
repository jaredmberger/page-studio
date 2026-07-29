(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('source') !== 'curatoros') return;

  const rawPageUrl = params.get('url') || '';
  let pageUrl;
  try {
    pageUrl = new URL(rawPageUrl);
  } catch {
    return;
  }
  if (!['oceanliners.net', 'www.oceanliners.net'].includes(pageUrl.hostname.toLowerCase())) return;

  const title = clean(params.get('finding_title')) || 'CuratorOS finding';
  const category = clean(params.get('finding_category'));
  const recommendation = clean(params.get('recommendation'));
  const checkedUrl = safeHttp(params.get('checked_url'));
  const replacementUrl = safeHttp(params.get('replacement_url'));

  const loaderPanel = document.querySelector('.loader-panel');
  const urlInput = document.querySelector('#page-url');
  const loadButton = document.querySelector('#load-url');
  if (!loaderPanel || !urlInput || !loadButton) return;

  const panel = document.createElement('section');
  panel.className = 'handoff-panel';
  panel.setAttribute('aria-labelledby', 'handoff-title');
  panel.innerHTML = `
    <div class="handoff-panel__heading">
      <div>
        <span class="eyebrow">Repair handoff from CuratorOS</span>
        <h2 id="handoff-title">${escapeHtml(title)}</h2>
      </div>
      ${category ? `<span class="handoff-panel__category">${escapeHtml(category)}</span>` : ''}
    </div>
    <div class="handoff-panel__details">
      ${recommendation ? `<p><strong>Recommended repair</strong><span>${escapeHtml(recommendation)}</span></p>` : ''}
      ${checkedUrl ? `<p><strong>Checked URL</strong><a href="${escapeAttribute(checkedUrl)}" target="_blank" rel="noopener">${escapeHtml(checkedUrl)}</a></p>` : ''}
      ${replacementUrl ? `<p><strong>Suggested replacement</strong><a href="${escapeAttribute(replacementUrl)}" target="_blank" rel="noopener">${escapeHtml(replacementUrl)}</a></p>` : ''}
    </div>
    <div class="handoff-panel__actions">
      <a href="${escapeAttribute(pageUrl.href)}" target="_blank" rel="noopener">Inspect live page</a>
      <a href="https://curator.oceanliners.net/">Back to CuratorOS</a>
    </div>
  `;
  loaderPanel.insertAdjacentElement('afterend', panel);

  urlInput.value = pageUrl.href;
  prefillPublishingPath(pageUrl);

  queueMicrotask(() => {
    loadButton.click();
    panel.scrollIntoView({ block: 'start' });
  });

  function prefillPublishingPath(url) {
    const pathInput = document.querySelector('#repo-path');
    const branchInput = document.querySelector('#branch-name');
    const commitInput = document.querySelector('#commit-message');
    if (pathInput && !pathInput.value.trim()) {
      let path = url.pathname.replace(/^\/+|\/+$/g, '');
      if (!path) path = 'index';
      if (!/\.[a-z0-9]+$/i.test(path)) path += '.html';
      pathInput.value = path;
    }
    const slug = url.pathname.split('/').filter(Boolean).pop() || 'page';
    if (branchInput && (!branchInput.value.trim() || branchInput.value === 'page-studio-edit')) {
      branchInput.value = `page-studio-${slug}-${Date.now().toString(36)}`;
    }
    if (commitInput && (!commitInput.value.trim() || commitInput.value === 'Edit page in Page Studio')) {
      commitInput.value = `Repair ${title} in Page Studio`;
    }
  }

  function clean(value) {
    return String(value || '').trim().slice(0, 1000);
  }

  function safeHttp(value) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();