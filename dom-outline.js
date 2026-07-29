(() => {
  const editor = document.querySelector('#code-editor');
  const preview = document.querySelector('#preview');
  const statusEl = document.querySelector('#status');
  const toggleButton = document.querySelector('#toggle-document-map');
  if (!editor || !preview) return;

  let currentPath = '';
  let currentTag = '';
  let currentText = '';
  let gesture = null;

  const panel = document.createElement('aside');
  panel.className = 'dom-outline-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="dom-outline-heading">
      <div>
        <span class="eyebrow">Document map</span>
        <h2>Editable elements</h2>
      </div>
      <button type="button" data-outline-refresh>Refresh</button>
    </div>
    <p class="dom-outline-help">Use this optional fallback to select elements by structure. Direct selection in the live preview remains the primary editing method.</p>
    <div class="dom-outline-list" data-outline-list></div>
  `;

  const studio = document.querySelector('.studio');
  studio?.insertBefore(panel, studio.querySelector('.studio-toolbar')?.nextSibling || null);

  const list = panel.querySelector('[data-outline-list]');
  const refreshButton = panel.querySelector('[data-outline-refresh]');
  const previewStage = preview.closest('.preview-stage');

  const overlay = document.createElement('div');
  overlay.className = 'preview-selection-overlay';
  overlay.setAttribute('aria-label', 'Select an element in the live preview');
  overlay.tabIndex = 0;
  previewStage?.appendChild(overlay);

  function status(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  function cssPathFor(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== el.ownerDocument.documentElement) {
      let index = 1;
      let sibling = el;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === el.tagName) index++;
      }
      parts.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${index})`);
      el = el.parentElement;
    }
    return `html>${parts.join('>')}`;
  }

  function labelFor(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.getAttribute('aria-label') || el.getAttribute('alt') || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList?.length ? `.${[...el.classList].slice(0, 2).join('.')}` : '';
    return {
      tag,
      title: `${tag}${id}${cls}`,
      detail: text.slice(0, 90) || '(no text)'
    };
  }

  function getEditableElements(doc) {
    const selector = 'main,header,nav,section,article,aside,footer,h1,h2,h3,h4,h5,h6,p,blockquote,figure,figcaption,img,a,button,ul,ol,li,table,thead,tbody,tr,th,td,div';
    return [...doc.querySelectorAll(selector)].filter((el) => {
      if (['script', 'style', 'noscript', 'template'].includes(el.tagName.toLowerCase())) return false;
      if (!el.closest('body')) return false;
      const text = (el.textContent || '').trim();
      const meaningful = text || el.matches('img,figure,section,article,main,header,footer,nav,aside,table');
      if (!meaningful) return false;
      if (el.matches('div') && !el.id && !el.className && el.children.length === 1) return false;
      return true;
    }).slice(0, 500);
  }

  function renderOutline() {
    const doc = new DOMParser().parseFromString(editor.value, 'text/html');
    const elements = getEditableElements(doc);
    list.innerHTML = '';

    if (!elements.length) {
      list.innerHTML = '<p class="dom-outline-empty">No editable elements were found.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const el of elements) {
      const path = cssPathFor(el);
      const meta = labelFor(el);
      const depth = Math.max(0, path.split('>').length - 3);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dom-outline-item';
      button.dataset.path = path;
      button.style.setProperty('--outline-depth', String(Math.min(depth, 8)));
      button.innerHTML = `<strong>${escapeHtml(meta.title)}</strong><span>${escapeHtml(meta.detail)}</span>`;
      if (path === currentPath) button.classList.add('is-selected');
      fragment.appendChild(button);
    }
    list.appendChild(fragment);
  }

  function ensurePreviewStyle(doc) {
    let style = doc.querySelector('style[data-page-studio-outline-style]');
    if (!style) {
      style = doc.createElement('style');
      style.dataset.pageStudioOutlineStyle = '';
      style.textContent = '[data-page-studio-outline-selected]{outline:3px solid #bfa46a!important;outline-offset:3px!important;scroll-margin:90px!important;}';
      (doc.head || doc.documentElement).appendChild(style);
    }
  }

  function outlineInPreview(path) {
    const doc = preview.contentDocument;
    if (!doc) return;
    ensurePreviewStyle(doc);
    doc.querySelectorAll('[data-page-studio-outline-selected]').forEach((el) => el.removeAttribute('data-page-studio-outline-selected'));
    const target = doc.querySelector(path);
    if (!target) return;
    target.setAttribute('data-page-studio-outline-selected', '');
  }

  function findOutlineButton(path) {
    return [...list.querySelectorAll('.dom-outline-item')]
      .find((item) => item.dataset.path === path) || null;
  }

  function selectPath(path, source = 'document map') {
    if (!path) return;

    const doc = new DOMParser().parseFromString(editor.value, 'text/html');
    const target = doc.querySelector(path);
    if (!target) {
      status('Page Studio could not locate that element in the current HTML.', true);
      return;
    }

    const meta = labelFor(target);
    currentPath = path;
    currentTag = meta.tag;
    currentText = (target.textContent || '').replace(/\s+/g, ' ').trim();

    list.querySelectorAll('.dom-outline-item.is-selected').forEach((item) => item.classList.remove('is-selected'));
    findOutlineButton(path)?.classList.add('is-selected');
    outlineInPreview(path);

    window.postMessage({
      type: 'page-studio-select',
      path: currentPath,
      tag: currentTag,
      text: currentText,
      source
    }, '*');

    status(`Selected ${currentTag} from the ${source}.`);
  }

  function nearestEditableTarget(target) {
    if (!target || target.nodeType !== 1) return null;
    const leafSelector = 'a,button,img,figcaption,h1,h2,h3,h4,h5,h6,p,blockquote,li,th,td';
    const leaf = target.closest(leafSelector);
    if (leaf) return leaf;
    const containerSelector = 'figure,table,ul,ol,nav,header,footer,aside,article,section,main,div';
    return target.closest(containerSelector);
  }

  function selectFromOverlayPoint(clientX, clientY) {
    const doc = preview.contentDocument;
    if (!doc) {
      status('The preview document is not available yet.', true);
      return;
    }

    const iframeRect = preview.getBoundingClientRect();
    const x = clientX - iframeRect.left;
    const y = clientY - iframeRect.top;
    if (x < 0 || y < 0 || x > iframeRect.width || y > iframeRect.height) return;

    const rawTarget = doc.elementFromPoint(x, y);
    const target = nearestEditableTarget(rawTarget);
    if (!target || target === doc.documentElement || target === doc.body) {
      status('No editable element was found at that point.', true);
      return;
    }

    selectPath(cssPathFor(target), 'live preview');
  }

  function getPreviewScroller() {
    const doc = preview.contentDocument;
    return doc?.scrollingElement || doc?.documentElement || null;
  }

  function startGesture(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const scroller = getPreviewScroller();
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scroller?.scrollLeft || 0,
      scrollTop: scroller?.scrollTop || 0,
      moved: false
    };
    overlay.setPointerCapture?.(event.pointerId);
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) gesture.moved = true;
    if (!gesture.moved) return;
    event.preventDefault();
    const scroller = getPreviewScroller();
    if (!scroller) return;
    scroller.scrollLeft = gesture.scrollLeft - dx;
    scroller.scrollTop = gesture.scrollTop - dy;
  }

  function endGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const moved = gesture.moved;
    gesture = null;
    overlay.releasePointerCapture?.(event.pointerId);
    if (moved) return;
    event.preventDefault();
    event.stopPropagation();
    selectFromOverlayPoint(event.clientX, event.clientY);
  }

  overlay.addEventListener('pointerdown', startGesture);
  overlay.addEventListener('pointermove', moveGesture, { passive: false });
  overlay.addEventListener('pointerup', endGesture);
  overlay.addEventListener('pointercancel', () => { gesture = null; });

  function syncOverlayToIframe() {
    if (!previewStage) return;
    const stageRect = previewStage.getBoundingClientRect();
    const iframeRect = preview.getBoundingClientRect();
    overlay.style.left = `${iframeRect.left - stageRect.left + previewStage.scrollLeft}px`;
    overlay.style.top = `${iframeRect.top - stageRect.top + previewStage.scrollTop}px`;
    overlay.style.width = `${iframeRect.width}px`;
    overlay.style.height = `${iframeRect.height}px`;
  }

  const resizeObserver = new ResizeObserver(syncOverlayToIframe);
  resizeObserver.observe(preview);
  resizeObserver.observe(previewStage || preview);
  previewStage?.addEventListener('scroll', syncOverlayToIframe, { passive: true });
  window.addEventListener('resize', syncOverlayToIframe, { passive: true });

  function handleOutlineActivation(event) {
    const button = event.target.closest('.dom-outline-item');
    if (!button || !list.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    selectPath(button.dataset.path || '');
  }

  list.addEventListener('click', handleOutlineActivation);
  list.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') handleOutlineActivation(event);
  });

  refreshButton.addEventListener('click', () => {
    renderOutline();
    status('Document map refreshed.');
  });

  toggleButton?.addEventListener('click', () => {
    const shouldOpen = panel.hidden;
    panel.hidden = !shouldOpen;
    toggleButton.setAttribute('aria-expanded', String(shouldOpen));
    toggleButton.classList.toggle('active', shouldOpen);
    if (shouldOpen) {
      renderOutline();
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      status('Document Map opened.');
    } else {
      status('Document Map hidden.');
    }
  });

  editor.addEventListener('input', debounce(() => {
    if (!panel.hidden) renderOutline();
  }, 500));
  preview.addEventListener('load', () => {
    if (currentPath) outlineInPreview(currentPath);
    requestAnimationFrame(syncOverlayToIframe);
  });

  requestAnimationFrame(syncOverlayToIframe);

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }
})();