(() => {
  const validationSummary = document.querySelector('#validation-summary');
  const validationList = document.querySelector('#validation-list');
  if (!validationSummary || !validationList) return;

  function applyH1Policy() {
    const items = [...validationList.querySelectorAll('.validation-item')];
    let changed = false;

    items.forEach((item) => {
      const title = item.querySelector('strong')?.textContent?.trim() || '';
      if (/^0 H1 headings$/i.test(title) && item.classList.contains('error')) {
        item.classList.remove('error');
        item.classList.add('warning');
        changed = true;
      }
    });

    if (!changed && !items.some((item) => /^0 H1 headings$/i.test(item.querySelector('strong')?.textContent?.trim() || ''))) return;

    const errors = items.filter((item) => item.classList.contains('error')).length;
    const warnings = items.filter((item) => item.classList.contains('warning')).length;
    const passed = items.filter((item) => item.classList.contains('ok')).length;
    validationSummary.textContent = `${errors} errors · ${warnings} warnings · ${passed} checks passed`;
  }

  const observer = new MutationObserver(() => requestAnimationFrame(applyH1Policy));
  observer.observe(validationList, { childList: true });

  applyH1Policy();
})();
