(() => {
  const preview = document.querySelector('#preview');
  const diagnostics = document.querySelector('#sync-diagnostics');
  if (!preview) return;

  let retryTimer = 0;

  preview.addEventListener('load', scheduleInstall);
  scheduleInstall();

  function scheduleInstall() {
    clearTimeout(retryTimer);
    let attempts = 0;

    const tryInstall = () => {
      attempts += 1;
      try {
        const win = preview.contentWindow;
        const doc = preview.contentDocument;
        if (!win || !doc?.documentElement || !doc.body) throw new Error('preview not ready');

        restoreTouchScrolling(win, doc);
        mark('Touch scrolling restored inside the Live preview.');
        return;
      } catch {
        if (attempts < 20) retryTimer = setTimeout(tryInstall, 100);
      }
    };

    tryInstall();
  }

  function restoreTouchScrolling(win, doc) {
    doc.documentElement.style.setProperty('touch-action', 'pan-y pinch-zoom', 'important');
    doc.body.style.setProperty('touch-action', 'pan-y pinch-zoom', 'important');
    doc.documentElement.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
    doc.body.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');

    const proto = win.Event?.prototype;
    if (!proto || proto.__pageStudioScrollPatched) return;

    const originalPreventDefault = proto.preventDefault;
    Object.defineProperty(proto, '__pageStudioScrollPatched', {
      value: true,
      configurable: true
    });

    proto.preventDefault = function pageStudioPreventDefault() {
      // The preview bridge previously canceled every touchstart, which prevents
      // iPad Safari from beginning a native scroll gesture. Keep cancellation
      // available for completed taps, but never cancel the gesture start.
      if (this.type === 'touchstart') return;
      return originalPreventDefault.call(this);
    };
  }

  function mark(detail) {
    if (!diagnostics) return;
    const item = document.createElement('div');
    item.className = 'validation-item ok';
    item.innerHTML = `<strong>✓ ${escapeHtml(detail)}</strong><span>${escapeHtml(new Date().toLocaleTimeString())}</span>`;
    diagnostics.appendChild(item);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }
})();
