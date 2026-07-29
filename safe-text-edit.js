(() => {
  const statusEl = document.querySelector('#status');
  const textTags = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'figcaption', 'li', 'th', 'td',
    'a', 'button', 'span', 'label', 'strong', 'em'
  ]);

  let selectedTag = '';

  function editTextButton() {
    return document.querySelector('[data-direct-action="edit-text"]');
  }

  function updateButton() {
    const button = editTextButton();
    if (!button) return;
    const allowed = textTags.has(selectedTag);
    button.disabled = !allowed;
    button.setAttribute('aria-disabled', String(!allowed));
    button.title = allowed
      ? 'Edit the selected text element'
      : 'Select a paragraph, heading, caption, list item, link, or other text element first';
  }

  function showStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = 'var(--warning)';
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'page-studio-select') return;
    selectedTag = String(data.tag || '').toLowerCase();
    requestAnimationFrame(updateButton);
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-direct-action="edit-text"]');
    if (!button || textTags.has(selectedTag)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showStatus('Select the paragraph, heading, caption, link, or other text element itself before using Edit Text. Container text editing is blocked to protect the page layout.');
  }, true);
})();
