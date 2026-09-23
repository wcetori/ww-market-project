'use strict';

/** Shared presentation helpers. All user-provided strings are escaped before HTML insertion. */
(() => {
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/>',
    'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    heart: '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>',
    bag: '<path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    laptop: '<rect x="4" y="3" width="16" height="13" rx="1"/><path d="m4 16-3 4h22l-3-4M9 20h6"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/>',
    tv: '<rect x="2" y="4" width="20" height="14" rx="1"/><path d="M8 22h8m-4-4v4"/>',
    headphones: '<path d="M3 15v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="5" height="9" rx="2"/><rect x="16" y="12" width="5" height="9" rx="2"/>',
    mouse: '<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 2v7"/>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>',
    watch: '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="m8 6 1-5h6l1 5m-8 12 1 5h6l1-5m-4-9v3l2 1"/>',
    camera: '<path d="M3 6h4l2-3h6l2 3h4v15H3V6Z"/><circle cx="12" cy="13" r="4"/>',
    gamepad: '<path d="M7 6h10c3 0 5 10 4 13s-5-2-6-3H9c-1 1-5 6-6 3S4 6 7 6Z"/><path d="M6 10v5m-2.5-2.5h5M16 10h.1M18 13h.1"/>',
    wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>',
    home: '<path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M9 21v-8h6v8"/>',
    sliders: '<path d="M4 21v-7m0-4V3m8 18V11m0-4V3m8 18v-3m0-4V3M1 10h6m2-3h6m2 7h6"/>',
    sparkles: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3ZM20 2v4m-2-2h4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/>',
    box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M3 7l9 5v10M7 4.8l9 5V14"/>',
    logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10"/>',
  };
  const moneyFormatter = new Intl.NumberFormat('uk-UA');
  const dialog = document.getElementById('app-dialog');
  let dialogKind = '';
  let opener = null;
  let toastTimer;

  function escape(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function icon(name) {
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  }

  function money(value) { return `${moneyFormatter.format(value)} ₴`; }

  function image(product, className = '', lazy = true) {
    const sizes = className === 'cart-item-image' ? '76px' : !lazy ? '(max-width: 680px) 85vw, 400px' : '(max-width: 360px) 85vw, (max-width: 680px) 43vw, (max-width: 900px) 32vw, 300px';
    const sources = product.imgLarge ? `srcset="${escape(product.img)} 480w, ${escape(product.imgLarge)} 960w" sizes="${sizes}"` : '';
    const alt = product.photoNote || `Фото ${product.name}`;
    return `<img src="${escape(product.img)}" ${sources} alt="${escape(alt)}" width="480" height="360" class="${className}" ${lazy ? 'loading="lazy"' : 'loading="eager"'} decoding="async" data-product-image="${product.id}">`;
  }

  function empty(title, description, action = 'close-dialog', label = 'До покупок', symbol = 'bag') {
    return `<div class="empty-state">${icon(symbol)}<h3>${escape(title)}</h3><p>${escape(description)}</p><button class="button secondary" data-action="${action}">${escape(label)} ${icon('arrow-right')}</button></div>`;
  }

  function openDialog(kind, title, content, variant = '') {
    if (!dialog.open) opener = document.activeElement;
    dialogKind = kind;
    dialog.className = variant;
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-content').innerHTML = content;
    document.body.classList.add('modal-open');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    const target = dialog.querySelector('[autofocus]') || dialog.querySelector('.dialog-header button');
    target?.focus({ preventScroll: true });
  }

  function closeDialog() { dialog.close(); }

  function toast(message) {
    const element = document.getElementById('toast');
    // A toast inside the modal remains visible in the browser's top layer.
    (dialog.open ? dialog : document.body).append(element);
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
  }

  function updateHeader() {
    const quantities = WW.store.data.cart.reduce((sum, item) => sum + item.qty, 0);
    for (const [id, count] of [['cart-count', quantities], ['favorites-count', WW.store.favorites.length]]) {
      const element = document.getElementById(id);
      element.textContent = count;
      element.hidden = count === 0;
    }
    document.getElementById('account-label').textContent = WW.store.user?.name || 'Кабінет';
  }

  dialog.addEventListener('close', () => {
    // A queued close event may arrive after another dialog has already opened.
    if (dialog.open) return;
    document.body.classList.remove('modal-open');
    dialogKind = '';
    document.body.append(document.getElementById('toast'));
    const returnTarget = opener?.isConnected ? opener : document.getElementById('search');
    returnTarget.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  // Only a pointer sequence that starts and ends outside the panel dismisses it.
  let backdropPointer = false;
  function outsidePanel(event) {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  dialog.addEventListener('pointerdown', event => { backdropPointer = event.target === dialog && outsidePanel(event); });
  dialog.addEventListener('click', event => {
    if (backdropPointer && event.target === dialog && outsidePanel(event)) closeDialog();
    backdropPointer = false;
  });

  document.addEventListener('error', event => {
    const target = event.target;
    if (target instanceof HTMLImageElement && target.dataset.productImage && !target.dataset.fallback) {
      target.dataset.fallback = 'true';
      target.removeAttribute('srcset');
      target.removeAttribute('sizes');
      target.src = 'assets/images/product-placeholder.svg';
    }
  }, true);

  WW.ui = { escape, icon, hydrateIcons, money, image, empty, openDialog, closeDialog, toast, updateHeader, get dialogKind() { return dialogKind; } };
})();
