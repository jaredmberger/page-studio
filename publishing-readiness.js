(() => {
  const editor = document.querySelector('#code-editor');
  const publishPanel = document.querySelector('.publish-panel');
  const statusEl = document.querySelector('#status');
  const repoInput = document.querySelector('#repo-name');
  const pathInput = document.querySelector('#repo-path');
  const branchInput = document.querySelector('#branch-name');
  const commitInput = document.querySelector('#commit-message');
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
  `;
  publishPanel.appendChild(review);

  const summary = review.querySelector('[data-publish-summary]');
  const packet = review.querySelector('[data-publish-packet]');

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
    if (!path || !/\.(html?|md|css|js|json)$/i.test(path)) errors.push('Enter a valid repository file path.');
    if (!branch) errors.push('Enter a branch name.');
    if (!commit) errors.push('Enter a commit message.');
    if (!editor.value.trim()) errors.push('There is no page source to publish.');

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

  document.querySelector('#review-publish')?.addEventListener('click', showReview);
  document.querySelector('#copy-publish-packet')?.addEventListener('click', copyPacket);
  review.querySelector('[data-close-publish-review]')?.addEventListener('click', () => { review.hidden = true; });
})();
