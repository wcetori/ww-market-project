'use strict';

/** App entry point: delegated events keep behavior separate from HTML templates. */
(() => {
  let searchTimer;
  const actions = {
    'close-dialog': () => WW.ui.closeDialog(),
    category: button => WW.catalog.setCategory(button.dataset.category),
    'show-sale': () => WW.catalog.showSale(),
    'reset-filters': () => WW.catalog.reset(),
    'remove-filter': button => WW.catalog.removeFilter(button.dataset.filter),
    'load-more': () => WW.catalog.loadMore(),
    product: button => WW.catalog.openProduct(Number(button.dataset.id)),
    'add-cart': button => WW.cart.add(Number(button.dataset.id)),
    'remove-cart': button => WW.cart.remove(Number(button.dataset.id)),
    quantity: button => WW.cart.changeQuantity(Number(button.dataset.id), Number(button.dataset.delta)),
    'toggle-favorite': button => WW.cart.toggleFavorite(Number(button.dataset.id)),
    cart: () => WW.cart.openCart(),
    favorites: () => WW.cart.openFavorites(),
    checkout: () => WW.cart.checkout(),
    orders: () => WW.cart.openOrders(),
    'repeat-order': button => WW.cart.repeatOrder(button.dataset.order),
    account: () => WW.account.open(),
    login: () => WW.account.open('login'),
    register: () => WW.account.open('register'),
    'reset-password': () => WW.account.open('reset'),
    logout: () => WW.account.logout(),
    'toggle-filters': button => {
      const filters = document.getElementById('filters');
      const expanded = filters.classList.toggle('expanded');
      button.setAttribute('aria-expanded', String(expanded));
      if (expanded) {
        filters.scrollIntoView({ block: 'start' });
        filters.querySelector('button')?.focus({ preventScroll: true });
      }
    },
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const root = button.closest('dialog') || document;
    const { action, id, delta } = button.dataset;
    actions[button.dataset.action]?.(button);
    // Preserve keyboard position when a quantity or favorite button is re-rendered.
    if (!button.isConnected && ['quantity', 'toggle-favorite', 'add-cart'].includes(action)) {
      const replacement = [...root.querySelectorAll('button[data-action]')].find(element =>
        element.dataset.action === action && element.dataset.id === id && element.dataset.delta === delta);
      replacement?.focus({ preventScroll: true });
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'search-form') {
      event.preventDefault();
      clearTimeout(searchTimer);
      WW.catalog.applyControls();
      document.getElementById('catalog').scrollIntoView({ block: 'start' });
    } else if (form.id === 'checkout-form') {
      event.preventDefault();
      WW.cart.submitCheckout(form);
    } else if (form.id === 'account-form') {
      event.preventDefault();
      WW.account.submit(form);
    }
  });

  document.getElementById('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => WW.catalog.applyControls(), 180);
  });
  for (const id of ['min-price', 'max-price']) {
    document.getElementById(id).addEventListener('input', () => WW.catalog.applyControls());
  }
  document.addEventListener('change', event => {
    if (event.target.matches('[name="brand"], #rating-filter, #sale-filter, #sort')) WW.catalog.applyControls();
    if (event.target.matches('#checkout-form [name="delivery"]')) {
      const courier = event.target.value === 'courier';
      document.getElementById('address-label').textContent = courier ? 'Вулиця, будинок, квартира' : 'Номер відділення та назва пошти';
      event.target.form.elements.address.placeholder = courier ? 'Вулиця Хрещатик, 1, кв. 12' : 'Наприклад, Нова пошта, відділення 12';
    }
  });

  window.addEventListener('storage', event => {
    if (event.key !== WW.core.STORAGE_KEY && event.key !== null) return;
    WW.store.reload();
    WW.catalog.render();
    if (WW.ui.dialogKind === 'cart') WW.cart.openCart();
    else if (WW.ui.dialogKind === 'favorites') WW.cart.openFavorites();
    else if (WW.ui.dialogKind === 'orders') WW.cart.openOrders();
    else if (WW.ui.dialogKind === 'profile') WW.account.open();
    else if (WW.ui.dialogKind === 'checkout') {
      WW.cart.openCart();
      WW.ui.toast('Кошик змінився в іншій вкладці. Перевірте його перед оформленням.');
    }
  });

  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('catalog-size').textContent = `${WW.products.length} товарів.`;
  document.getElementById('category-count').textContent = `Категорій у каталозі: ${WW.core.categories.length - 1}`;
  WW.ui.hydrateIcons();
  WW.catalog.init();
})();
