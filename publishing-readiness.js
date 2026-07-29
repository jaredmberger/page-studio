(() => {
  const editor = document.querySelector('#code-editor');
  const publishPanel = document.querySelector('.publish-panel');
  const statusEl = document.querySelector('#status');
  const repoInput = document.querySelector('#repo-name');
  const pathInput = document.querySelector('#repo-path');
  const branchInput = document.querySelector('#branch-name');
  const commitInput = document.querySelector('#commit-message');
  const publisherBaseUrl = window.PAGE_STUDIO_CONFIG?.publisherBaseUrl?.replace(/\/$/, '') || '';
  if (!editor || !publishPanel || !repoInput || !pathInput || !branchInput || !commitInput) return;

  const actions = document.createElement('div');
  actions.className = 'publish-actions';
  actions.innerHTML = `
    <button id="review-publish" type="button">Review Publishing</button>
    <button id="copy-publish-packet" type="button">Copy Publishing Packet</button>
  `;
  publishPanel.appendChild(actions);

  const review = document.createElement('section');
  review.className = 'publish-review';
  review.hidden = true;
  review.innerHTML = `
    <div class="publish-review__heading">
      <div>
        <span class="eyebrow">Publishing review</span>
        <h3>Ready for GitHub</h3>
      </div>
      <button type="button" data-close-publish-review>Close</button>
    </div>
    <div class="publish-review__summary" data-publish-summary></div>
    <pre class="publish-review__packet" data-publish-packet></pre>
    <div class="publish-review__actions">
      <button type="button" data-confirm-publish>Create Pull Request</button>
    </div>
    <div class="publish-result" data-publish-result hidden></div>
  `;
  publishPanel.appendChild(review);

  const summary = review.querySelector('[data-publish-summary]');
  const packet = review.querySelector('[data-publish-packet]');
  const publishButton = review.querySelector('[data-confirm-publish]');
  const resultBox = review.querySelector('[data-publish-result]');

  function status(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  function normalizeRepo(value) {
    return value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  }

  function normalizePath(value) {
    return value.trim().replace(/^\/+/, '');
  }

  function normalizeBranch(value) {
    return value.trim().replace(/^refs\/heads\//, '').replace(/\s+/g, '-').replace(/^\/+|\/+$/g, '');
  }

  function validate() {
    const errors = [];
    const repo = normalizeRepo(repoInput.value);
    const path = normalizePath(pathInput.value);
    const branch = normalizeBranch(branchInput.value);
    const commit = commitInput.value.trim();

    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) errors.push('Repository must use owner/name format.');
    if (!path || path.includes('..') || !/\.(html?|md|css|js|json)$/i.test(path)) errors.push('Enter a valid repository file path.');
    if (!branch || ['main', 'master'].includes(branch.toLowerCase())) errors.push('Enter a non-protected branch name.');
    if (!commit) errors.push('Enter a commit message.');
    if (!editor.value.trim()) errors.push('There is no page source to publish.');
    if (!publisherBaseUrl) errors.push('The secure publisher endpoint is not configured.');

    const validationText = document.querySelector('#validation-summary')?.textContent || '';
    const errorMatch = validationText.match(/\b(\d+) errors?\b/i);
    const validationErrors = errorMatch ? Number(errorMatch[1]) : 0;

    return { errors, repo, path, branch, commit, validationErrors };
  }

  function buildPacket() {
    const result = validate();
    const lines = [
      'Page Studio Publishing Packet',
      '==============================',
      `Repository: ${result.repo || '(missing)'}`,
      `File path: ${result.path || '(missing)'}`,
      `Branch: ${result.branch || '(missing)'}`,
      `Commit message: ${result.commit || '(missing)'}`,
      `Validation errors: ${result.validationErrors}`,
      '',
      'HTML source follows:',
      '--------------------',
      editor.value
    ];
    return { ...result, text: lines.join('\n') };
  }

  function showReview() {
    const result = buildPacket();
    summary.innerHTML = '';
    resultBox.hidden = true;
    resultBox.innerHTML = '';

    const state = document.createElement('div');
    state.className = `publish-readiness ${result.errors.length || result.validationErrors ? 'warning' : 'ready'}`;
    state.textContent = result.errors.length
      ? `${result.errors.length} publishing field issue${result.errors.length === 1 ? '' : 's'} must be fixed.`
      : result.validationErrors
        ? `Publishing fields are complete, but validation reports ${result.validationErrors} error${result.validationErrors === 1 ? '' : 's'}.`
        : 'Publishing packet is complete and ready for GitHub.';
    summary.appendChild(state);

    if (result.errors.length) {
      const list = document.createElement('ul');
      result.errors.forEach((message) => {
        const item = document.createElement('li');
        item.textContent = message;
        list.appendChild(item);
      });
      summary.appendChild(list);
    }

    packet.textContent = result.text;
    publishButton.disabled = Boolean(result.errors.length || result.validationErrors);
    review.hidden = false;
    review.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function copyPacket() {
    const result = buildPacket();
    if (result.errors.length) {
      showReview();
      status('Complete the publishing fields before copying the packet.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.text);
      status('Publishing packet copied.');
    } catch {
      showReview();
      status('Clipboard access was unavailable. Copy the packet from the review panel.', true);
    }
  }

  async function publish() {
    const result = buildPacket();
    if (result.errors.length || result.validationErrors) {
      showReview();
      status('Resolve publishing and validation errors before creating a pull request.', true);
      return;
    }

    const confirmed = confirm(
      `Create a GitHub pull request?\n\nRepository: ${result.repo}\nFile: ${result.path}\nBranch: ${result.branch}\nCommit: ${result.commit}`
    );
    if (!confirmed) return;

    publishButton.disabled = true;
    publishButton.textContent = 'Publishing…';
    resultBox.hidden = true;
    status('Securely publishing through the Worker…');

    try {
      const response = await fetch(`${publisherBaseUrl}/publish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: result.repo,
          path: result.path,
          branch: result.branch,
          commit: result.commit,
          title: result.commit,
          html: editor.value
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(data.details) ? ` ${data.details.join(' ')}` : '';
        throw new Error(`${data.error || `Publishing failed with status ${response.status}.`}${details}`);
      }

      resultBox.className = 'publish-result success';
      resultBox.innerHTML = `
        <strong>Pull request created.</strong>
        <span>${escapeHtml(data.repository)} · ${escapeHtml(data.file_path)} · ${escapeHtml(data.branch)}</span>
        <a href="${escapeAttribute(data.pull_request_url)}" target="_blank" rel="noopener">Open Pull Request #${Number(data.pull_request_number)}</a>
      `;
      resultBox.hidden = false;
      status(`Pull request #${data.pull_request_number} created successfully.`);
    } catch (error) {
      resultBox.className = 'publish-result error';
      resultBox.innerHTML = `<strong>Publishing failed.</strong><span>${escapeHtml(error.message)}</span>`;
      resultBox.hidden = false;
      status(error.message, true);
    } finally {
      publishButton.disabled = false;
      publishButton.textContent = 'Create Pull Request';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function escapeAttribute(value) {
    const url = String(value || '');
    return /^https:\/\/github\.com\//i.test(url) ? escapeHtml(url) : '#';
  }

  document.querySelector('#review-publish')?.addEventListener('click', showReview);
  document.querySelector('#copy-publish-packet')?.addEventListener('click', copyPacket);
  publishButton.addEventListener('click', publish);
  review.querySelector('[data-close-publish-review]')?.addEventListener('click', () => { review.hidden = true; });
})();
