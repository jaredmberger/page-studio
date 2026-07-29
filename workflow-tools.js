(() => {
  const editor = document.querySelector('#code-editor');
  const downloadButton = document.querySelector('#download-html');
  const toolbar = document.querySelector('.toolbar-actions');
  const studio = document.querySelector('.studio');
  if (!editor || !downloadButton || !toolbar || !studio) return;

  let baseline = editor.value;
  let lastDownloaded = editor.value;
  let lastDownloadedAt = null;

  const indicator = document.createElement('span');
  indicator.id = 'save-state-indicator';
  indicator.className = 'save-state-indicator saved';
  indicator.textContent = 'No unsaved changes';
  toolbar.prepend(indicator);

  const diffButton = document.createElement('button');
  diffButton.id = 'show-download-diff';
  diffButton.type = 'button';
  diffButton.textContent = 'Changes Since Download';
  toolbar.insertBefore(diffButton, downloadButton);

  const doneButton = document.createElement('button');
  doneButton.id = 'finish-page';
  doneButton.type = 'button';
  doneButton.textContent = 'Done';
  toolbar.appendChild(doneButton);

  const panel = document.createElement('section');
  panel.id = 'download-diff-panel';
  panel.className = 'download-diff-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="download-diff-heading">
      <div>
        <span class="eyebrow">Local workflow</span>
        <h3>Changes since last download</h3>
      </div>
      <button id="close-download-diff" type="button">Close</button>
    </div>
    <div id="download-diff-summary" class="download-diff-summary">No comparison available yet.</div>
    <pre id="download-diff-output" class="download-diff-output"></pre>
  `;
  studio.appendChild(panel);

  const closeButton = panel.querySelector('#close-download-diff');
  const summary = panel.querySelector('#download-diff-summary');
  const output = panel.querySelector('#download-diff-output');

  const updateDirtyState = () => {
    const dirty = editor.value !== lastDownloaded;
    indicator.classList.toggle('unsaved', dirty);
    indicator.classList.toggle('saved', !dirty);
    indicator.textContent = dirty ? 'Unsaved changes' : 'No unsaved changes';
  };

  const resetBaselinesForLoadedDocument = () => {
    baseline = editor.value;
    lastDownloaded = editor.value;
    lastDownloadedAt = null;
    updateDirtyState();
    panel.hidden = true;
  };

  const diffLines = (before, after) => {
    const a = before.split('\n');
    const b = after.split('\n');
    const max = Math.max(a.length, b.length);
    const rows = [];
    let added = 0;
    let removed = 0;
    let changed = 0;

    for (let i = 0; i < max; i += 1) {
      const oldLine = a[i];
      const newLine = b[i];
      if (oldLine === newLine) continue;
      if (oldLine === undefined) {
        rows.push(`+ ${newLine}`);
        added += 1;
      } else if (newLine === undefined) {
        rows.push(`- ${oldLine}`);
        removed += 1;
      } else {
        rows.push(`- ${oldLine}`);
        rows.push(`+ ${newLine}`);
        changed += 1;
      }
    }

    return { rows, added, removed, changed };
  };

  const showDiff = () => {
    const result = diffLines(lastDownloaded, editor.value);
    const total = result.added + result.removed + result.changed;
    const when = lastDownloadedAt ? ` Last downloaded ${lastDownloadedAt.toLocaleString()}.` : '';
    summary.textContent = total
      ? `${result.changed} changed line${result.changed === 1 ? '' : 's'}, ${result.added} added, ${result.removed} removed.${when}`
      : `No changes since the last download.${when}`;
    output.textContent = result.rows.length ? result.rows.join('\n') : 'No differences to display.';
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  editor.addEventListener('input', updateDirtyState);
  diffButton.addEventListener('click', showDiff);
  closeButton.addEventListener('click', () => { panel.hidden = true; });

  downloadButton.addEventListener('click', () => {
    queueMicrotask(() => {
      lastDownloaded = editor.value;
      baseline = editor.value;
      lastDownloadedAt = new Date();
      updateDirtyState();
    });
  });

  doneButton.addEventListener('click', () => {
    const issuesText = document.querySelector('#validation-summary')?.textContent || '';
    const hasErrors = /\b[1-9]\d* errors?\b/i.test(issuesText);
    if (hasErrors && !confirm(`${issuesText}\n\nDownload this page anyway?`)) return;

    downloadButton.click();
    queueMicrotask(() => {
      panel.hidden = true;
      indicator.textContent = 'Downloaded · ready for next page';
      indicator.classList.remove('unsaved');
      indicator.classList.add('saved');
    });
  });

  const observer = new MutationObserver(() => {
    if (editor.value !== baseline && editor.value !== lastDownloaded) return;
    if (editor.value !== baseline) resetBaselinesForLoadedDocument();
  });
  observer.observe(document.querySelector('#preview-label') || document.body, { childList: true, subtree: true, characterData: true });

  document.querySelector('#open-file')?.addEventListener('click', () => setTimeout(resetBaselinesForLoadedDocument, 400));
  document.querySelector('#load-url')?.addEventListener('click', () => setTimeout(resetBaselinesForLoadedDocument, 1200));

  updateDirtyState();
})();
