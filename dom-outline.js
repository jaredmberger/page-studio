(() => {
  const editor = document.querySelector('#code-editor');
  const preview = document.querySelector('#preview');
  const statusEl = document.querySelector('#status');
  if (!editor || !preview) return;

  let currentPath = '';
  let currentTag = '';
  let currentText = '';

  const panel = document.createElement('aside');
  panel.className = 'dom-outline-panel';
  panel.innerHTML = `
    <div class="dom-outline-heading">
      <div>
        <span class="eyebrow">Document map</span>
        <h2>Editable elements</h2>
      </div>
      <button type="button" data-outline-refresh>Refresh</button>
    </div>
    <p class="dom-outline-help">Tap an item here to select the matching element in the live preview. This works independently of iframe click handling.</p>
    <div class="dom-outline-list" data-outline-list></div>
  `;

  const studio = document.querySelector('.studio');
  studio?.insertBefore(panel, studio.querySelector('.studio-toolbar')?.nextSibling || null);

  const list = panel.querySelector('[data-outline-list]');
  const refreshButton = panel.querySelector('[data-outline-refresh]');

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

  function outlineInPreview(path) {
    const doc = preview.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-page-studio-outline-selected]').forEach((el) => el.removeAttribute('data-page-studio-outline-selected'));
    let style = doc.querySelector('style[data-page-studio-outline-style]');
    if (!style) {
      style = doc.createElement('style');
      style.dataset.pageStudioOutlineStyle = '';
      style.textContent = '[data-page-studio-outline-selected]{outline:3px solid #bfa46a!important;outline-offset:3px!important;scroll-margin:90px!important;}';
      (doc.head || doc.documentElement).appendChild(style);
    }
    const target = doc.querySelector(path);
    if (!target) return;
    target.setAttribute('data-page-studio-outline-selected', '');
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  function findOutlineButton(path) {
    return [...list.querySelectorAll('.dom-outline-item')]
      .find((item) => item.dataset.path === path) || null;
  }

  function selectPath(path) {
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
    currentText = (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);

    list.querySelectorAll('.dom-outline-item.is-selected').forEach((item) => item.classList.remove('is-selected'));
    findOutlineButton(path)?.classList.add('is-selected');
    outlineInPreview(path);

    window.postMessage({
      type: 'page-studio-select',
      path: currentPath,
      tag: currentTag,
      text: currentText,
      source: 'outline'
    }, '*');

    status(`Selected ${currentTag} from the document map.`);
  }

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

  editor.addEventListener('input', debounce(renderOutline, 500));
  preview.addEventListener('load', () => {
    if (currentPath) outlineInPreview(currentPath);
  });

  renderOutline();

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