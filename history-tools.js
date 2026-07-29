(() => {
  const editor = document.querySelector('#code-editor');
  const toolbar = document.querySelector('.toolbar-actions');
  const previewLabel = document.querySelector('#preview-label');
  if (!editor || !toolbar) return;

  const MAX_HISTORY = 50;
  let originalSource = editor.value;
  let undoStack = [];
  let redoStack = [];
  let lastSource = editor.value;
  let applyingHistory = false;
  let inputTimer = null;

  const group = document.createElement('div');
  group.className = 'history-actions';
  group.setAttribute('aria-label', 'Editing history');
  group.innerHTML = `
    <button id="undo-edit" type="button" disabled>Undo</button>
    <button id="redo-edit" type="button" disabled>Redo</button>
    <button id="restore-original" type="button">Restore Original</button>
  `;
  toolbar.prepend(group);

  const undoButton = group.querySelector('#undo-edit');
  const redoButton = group.querySelector('#redo-edit');
  const restoreButton = group.querySelector('#restore-original');

  function updateButtons() {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
    restoreButton.disabled = editor.value === originalSource;
  }

  function applySource(source, message) {
    applyingHistory = true;
    editor.value = source;
    lastSource = source;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    applyingHistory = false;
    document.querySelector('#status').textContent = message;
    updateButtons();
  }

  function recordChange() {
    if (applyingHistory || editor.value === lastSource) return;
    undoStack.push(lastSource);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    lastSource = editor.value;
    updateButtons();
  }

  editor.addEventListener('input', () => {
    if (applyingHistory) return;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(recordChange, 250);
  });

  undoButton.addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(editor.value);
    const previous = undoStack.pop();
    applySource(previous, 'Undid the last change.');
  });

  redoButton.addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(editor.value);
    const next = redoStack.pop();
    applySource(next, 'Redid the last change.');
  });

  restoreButton.addEventListener('click', () => {
    if (editor.value === originalSource) return;
    if (!confirm('Restore the page to the version originally loaded into Page Studio?')) return;
    undoStack.push(editor.value);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    applySource(originalSource, 'Restored the originally loaded page.');
  });

  function resetHistoryForLoadedPage() {
    originalSource = editor.value;
    lastSource = editor.value;
    undoStack = [];
    redoStack = [];
    updateButtons();
  }

  const observer = new MutationObserver(() => {
    setTimeout(resetHistoryForLoadedPage, 50);
  });
  if (previewLabel) observer.observe(previewLabel, { childList: true, characterData: true, subtree: true });

  document.querySelector('#open-file')?.addEventListener('click', () => setTimeout(resetHistoryForLoadedPage, 500));
  document.querySelector('#load-url')?.addEventListener('click', () => setTimeout(resetHistoryForLoadedPage, 1400));

  document.addEventListener('keydown', (event) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      undoButton.click();
    } else if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoButton.click();
    }
  });

  updateButtons();
})();
