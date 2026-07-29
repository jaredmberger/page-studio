(() => {
  const preview = document.querySelector('#preview');
  const editor = document.querySelector('#code-editor');
  const statusEl = document.querySelector('#status');
  if (!preview || !editor) return;

  let selectedPath = '';
  let selectedTag = '';
  let selectedText = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'direct-edit-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'dialog');
  toolbar.setAttribute('aria-label', 'Direct editing tools');
  toolbar.innerHTML = `
    <div class="direct-edit-toolbar__label">Selected: <strong data-selected-label>element</strong></div>
    <div class="direct-edit-toolbar__actions">
      <button type="button" data-direct-action="edit-text">Edit Text</button>
      <button type="button" data-direct-action="duplicate">Duplicate</button>
      <button type="button" data-direct-action="delete">Delete</button>
      <button type="button" data-direct-action="link">Wrap in Link</button>
      <button type="button" data-direct-action="heading">Heading</button>
      <button type="button" data-direct-action="image">Image</button>
      <button type="button" data-direct-action="section">Section</button>
      <button type="button" data-direct-action="insert-before">Insert Before</button>
      <button type="button" data-direct-action="insert-after">Insert After</button>
      <button type="button" data-direct-action="close" aria-label="Close direct editing toolbar">Close</button>
    </div>
  `;
  document.body.appendChild(toolbar);

  const modal = document.createElement('div');
  modal.className = 'direct-edit-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="direct-edit-modal__card" role="dialog" aria-modal="true" aria-labelledby="direct-edit-title">
      <div class="direct-edit-modal__heading">
        <div>
          <span class="eyebrow">Direct edit</span>
          <h2 id="direct-edit-title">Edit element</h2>
        </div>
        <button type="button" data-modal-close>Close</button>
      </div>
      <form data-direct-form>
        <div data-direct-fields></div>
        <div class="direct-edit-modal__actions">
          <button type="button" data-modal-cancel>Cancel</button>
          <button type="submit">Apply</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const title = modal.querySelector('#direct-edit-title');
  const fields = modal.querySelector('[data-direct-fields]');
  const form = modal.querySelector('[data-direct-form]');
  let submitHandler = null;

  function status(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : '';
  }

  function showToolbar() {
    if (!selectedPath) return;
    toolbar.querySelector('[data-selected-label]').textContent = selectedTag || 'element';
    toolbar.hidden = false;
  }

  function hideToolbar() {
    toolbar.hidden = true;
  }

  function openModal(heading, html, onSubmit) {
    title.textContent = heading;
    fields.innerHTML = html;
    submitHandler = onSubmit;
    modal.hidden = false;
    requestAnimationFrame(() => fields.querySelector('input,textarea,select')?.focus());
  }

  function closeModal() {
    modal.hidden = true;
    submitHandler = null;
  }

  function mutateSelected(mutator) {
    if (!selectedPath) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(editor.value, 'text/html');
    const target = doc.querySelector(selectedPath);
    if (!target) {
      status('Page Studio could not locate that element in the current HTML.', true);
      hideToolbar();
      return;
    }
    const result = mutator(target, doc);
    if (result === false) return;
    editor.value = '<!doctype html>\n' + doc.documentElement.outerHTML;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    status('Direct edit applied.');
    hideToolbar();
  }

  function insertBlock(target, doc, position, type) {
    let node;
    if (type === 'paragraph') {
      node = doc.createElement('p');
      node.textContent = 'New paragraph';
    } else if (type === 'heading') {
      node = doc.createElement('h2');
      node.textContent = 'New heading';
    } else if (type === 'image') {
      node = doc.createElement('img');
      node.setAttribute('src', '');
      node.setAttribute('alt', '');
    } else if (type === 'button') {
      node = doc.createElement('a');
      node.href = '#';
      node.textContent = 'Button';
      node.className = 'button';
    } else if (type === 'list') {
      node = doc.createElement('ul');
      node.innerHTML = '<li>List item</li><li>List item</li>';
    } else if (type === 'divider') {
      node = doc.createElement('hr');
    } else {
      node = doc.createElement('div');
      node.setAttribute('aria-hidden', 'true');
      node.style.minHeight = '2rem';
    }
    if (position === 'before') target.before(node);
    else target.after(node);
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-direct-action]');
    if (!button) return;
    const action = button.dataset.directAction;
    if (action === 'close') return hideToolbar();

    if (action === 'edit-text') {
      openModal('Edit text', `<label><span>Text</span><textarea name="text" rows="8">${escapeHtml(selectedText)}</textarea></label>`, (data) => {
        mutateSelected((target) => { target.textContent = data.get('text') || ''; });
      });
    }

    if (action === 'duplicate') {
      mutateSelected((target) => target.after(target.cloneNode(true)));
    }

    if (action === 'delete') {
      if (!confirm(`Delete this ${selectedTag || 'element'}?`)) return;
      mutateSelected((target) => target.remove());
    }

    if (action === 'link') {
      openModal('Wrap in link', `
        <label><span>Link URL</span><input name="href" type="url" placeholder="https://"></label>
        <label><span>Open in</span><select name="target"><option value="">Same tab</option><option value="_blank">New tab</option></select></label>
      `, (data) => {
        mutateSelected((target, doc) => {
          const link = doc.createElement('a');
          link.href = data.get('href') || '#';
          if (data.get('target') === '_blank') {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
          }
          target.replaceWith(link);
          link.appendChild(target);
        });
      });
    }

    if (action === 'heading') {
      openModal('Change element type', `
        <label><span>Element</span><select name="tag">
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="h5">Heading 5</option>
          <option value="h6">Heading 6</option>
        </select></label>
      `, (data) => {
        mutateSelected((target, doc) => {
          const replacement = doc.createElement(data.get('tag') || 'p');
          for (const attr of [...target.attributes]) replacement.setAttribute(attr.name, attr.value);
          replacement.innerHTML = target.innerHTML;
          target.replaceWith(replacement);
        });
      });
    }

    if (action === 'image') {
      openModal('Edit image', `
        <label><span>Image URL</span><input name="src" value=""></label>
        <label><span>Alt text</span><input name="alt" value=""></label>
        <label><span>Caption</span><input name="caption" value=""></label>
        <label class="direct-edit-check"><input name="lazy" type="checkbox" value="yes" checked><span>Lazy load</span></label>
      `, (data) => {
        mutateSelected((target, doc) => {
          const image = target.tagName.toLowerCase() === 'img' ? target : doc.createElement('img');
          image.src = data.get('src') || image.getAttribute('src') || '';
          image.alt = data.get('alt') || '';
          if (data.get('lazy')) image.loading = 'lazy'; else image.removeAttribute('loading');
          if (target !== image) target.replaceWith(image);
          const captionText = data.get('caption');
          if (captionText) {
            const figure = doc.createElement('figure');
            const caption = doc.createElement('figcaption');
            caption.textContent = captionText;
            image.replaceWith(figure);
            figure.append(image, caption);
          }
        });
      });
    }

    if (action === 'section') {
      mutateSelected((target, doc) => {
        const section = doc.createElement('section');
        target.replaceWith(section);
        section.appendChild(target);
      });
    }

    if (action === 'insert-before' || action === 'insert-after') {
      openModal(action === 'insert-before' ? 'Insert before' : 'Insert after', `
        <label><span>Block type</span><select name="type">
          <option value="paragraph">Paragraph</option>
          <option value="heading">Heading</option>
          <option value="image">Image</option>
          <option value="button">Button</option>
          <option value="list">List</option>
          <option value="divider">Divider</option>
          <option value="spacer">Spacer</option>
        </select></label>
      `, (data) => {
        mutateSelected((target, doc) => insertBlock(target, doc, action === 'insert-before' ? 'before' : 'after', data.get('type')));
      });
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!submitHandler) return;
    const data = new FormData(form);
    submitHandler(data);
    closeModal();
  });

  modal.addEventListener('click', (event) => {
    if (event.target.matches('[data-modal-close],[data-modal-cancel]') || event.target === modal) closeModal();
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'page-studio-select') return;
    selectedPath = data.path || '';
    selectedTag = data.tag || '';
    selectedText = data.text || '';
    showToolbar();
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  }
})();
