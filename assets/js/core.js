'use strict';

/** Pure catalog rules and validated browser persistence. No DOM dependencies. */
(() => {
  const STORAGE_KEY = 'ww_market_v2';
  const SESSION_KEY = 'ww_market_session';
  const MAX_QUANTITY = 99;
  const productMap = new Map(WW.products.map(product => [product.id, product]));

  const categories = [
    { name: 'Усі товари', value: 'all', icon: 'grid' },
    { name: 'Ноутбуки', value: 'Ноутбуки', icon: 'laptop' },
    { name: 'Смартфони', value: 'Смартфони', icon: 'phone' },
    { name: 'Телевізори', value: 'Телевізори', icon: 'tv' },
    { name: 'Навушники', value: 'Навушники', icon: 'headphones' },
    { name: 'Аксесуари', value: 'Аксесуари', icon: 'mouse' },
    { name: 'Планшети', value: 'Планшети', icon: 'tablet' },
    { name: 'Смартгодинники', value: 'Смартгодинники', icon: 'watch' },
    { name: 'Камери', value: 'Камери', icon: 'camera' },
    { name: 'Ігрові консолі', value: 'Ігрові консолі', icon: 'gamepad' },
    { name: 'Мережеве обладнання', value: 'Мережеве обладнання', icon: 'wifi' },
    { name: 'Побутова техніка', value: 'Побутова техніка', icon: 'home' },
  ];

  function readJSON(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function cleanCart(value) {
    if (!Array.isArray(value)) return [];
    const entries = new Map();
    for (const item of value) {
      if (!item || !productMap.has(item.id) || !Number.isInteger(item.qty) || item.qty < 1) continue;
      entries.set(item.id, Math.min(MAX_QUANTITY, (entries.get(item.id) || 0) + item.qty));
    }
    return [...entries].map(([id, qty]) => ({ id, qty }));
  }

  function cleanFavorites(value) {
    return Array.isArray(value) ? [...new Set(value.filter(id => productMap.has(id)))] : [];
  }

  function cleanAccounts(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(account => account &&
      typeof account.email === 'string' && account.email.length <= 254 &&
      typeof account.name === 'string' && account.name.length <= 60 &&
      /^[a-f0-9]{32}$/.test(account.salt) &&
      /^[a-f0-9]{64}$/.test(account.passwordHash) &&
      /^[a-f0-9]{64}$/.test(account.recoveryHash))
      .map(account => ({ ...account, favorites: cleanFavorites(account.favorites) }));
  }

  function cleanOrders(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(order => order && typeof order.id === 'string' &&
      Number.isFinite(Date.parse(order.createdAt)) &&
      typeof order.email === 'string' && typeof order.name === 'string' &&
      typeof order.city === 'string' && typeof order.address === 'string' &&
      typeof order.delivery === 'string' &&
      Array.isArray(order.items) && order.items.length > 0 &&
      order.items.every(item => item && productMap.has(item.id) &&
        typeof item.name === 'string' && Number.isInteger(item.qty) &&
        item.qty > 0 && item.qty <= MAX_QUANTITY &&
        Number.isFinite(item.price) && item.price >= 0) &&
      Number.isFinite(order.total) && order.total === order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
    ).slice(0, 100);
  }

  function emptyData() {
    return { version: 2, cart: [], favorites: [], accounts: [], orders: [] };
  }

  function loadData() {
    // Storage can be blocked entirely in private or restricted browser contexts.
    try {
      const saved = readJSON(localStorage, STORAGE_KEY, null);
      if (saved && typeof saved === 'object' && saved.version === 2) {
        return {
          version: 2,
          cart: cleanCart(saved.cart),
          favorites: cleanFavorites(saved.favorites),
          accounts: cleanAccounts(saved.accounts),
          orders: cleanOrders(saved.orders),
        };
      }
      return {
        ...emptyData(),
        cart: cleanCart(readJSON(localStorage, 'ww_cart', [])),
        favorites: cleanFavorites(readJSON(localStorage, 'ww_favs', [])),
      };
    } catch {
      return emptyData();
    }
  }

  let data = loadData();
  let sessionEmail = '';
  try { sessionEmail = sessionStorage.getItem(SESSION_KEY) || ''; } catch { /* In-memory session is sufficient. */ }

  function commit(next, requirePersistence = false) {
    let persisted = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { persisted = false; }
    if (!persisted && requirePersistence) return false;
    data = next;
    WW.store.persistenceAvailable = persisted;
    return true;
  }

  function normalize(value) {
    return String(value).toLocaleLowerCase('uk-UA').replace(/[ʼ’']/g, '').replace(/\s+/g, ' ').trim();
  }

  function discount(product) {
    return product.old > product.price ? Math.round((1 - product.price / product.old) * 100) : 0;
  }

  function filterProducts(products, filters) {
    const words = normalize(filters.search || '').split(' ').filter(Boolean);
    const result = products.filter(product => {
      const searchable = normalize(`${product.name} ${product.brand} ${product.cat} ${Object.values(product.spec).join(' ')}`);
      return (filters.category === 'all' || product.cat === filters.category) &&
        words.every(word => searchable.includes(word)) &&
        product.price >= filters.min && product.price <= filters.max &&
        (!filters.brands.length || filters.brands.includes(product.brand)) &&
        product.rating >= filters.rating && (!filters.sale || discount(product) > 0);
    });
    const sorters = {
      popular: (a, b) => b.reviews - a.reviews || b.rating - a.rating,
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
      discount: (a, b) => discount(b) - discount(a) || a.price - b.price,
    };
    return result.sort(sorters[filters.sort] || sorters.popular);
  }

  function cartTotal(cart = data.cart) {
    return cleanCart(cart).reduce((sum, item) => sum + productMap.get(item.id).price * item.qty, 0);
  }

  function setQuantity(id, quantity) {
    if (!productMap.has(id) || !Number.isInteger(quantity)) return false;
    const cart = data.cart.filter(item => item.id !== id);
    if (quantity > 0) cart.push({ id, qty: Math.min(quantity, MAX_QUANTITY) });
    // Keep the existing order stable as quantities change.
    cart.sort((a, b) => data.cart.findIndex(item => item.id === a.id) - data.cart.findIndex(item => item.id === b.id));
    return commit({ ...data, cart });
  }

  function toggleFavorite(id) {
    const user = WW.store.user;
    if (!user || !productMap.has(id)) return false;
    const current = WW.store.favorites;
    const favorites = current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id];
    const accounts = data.accounts.map(account => account.email === user.email
      ? { ...account, favorites } : account);
    return commit({ ...data, accounts }, true);
  }

  function setSession(email) {
    sessionEmail = email;
    try {
      if (email) sessionStorage.setItem(SESSION_KEY, email);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* Account session still works until the page is closed. */ }
  }

  WW.core = { categories, productMap, filterProducts, discount, cartTotal, cleanCart, cleanFavorites, MAX_QUANTITY, STORAGE_KEY };
  WW.store = {
    get data() { return data; },
    get user() { return data.accounts.find(account => account.email === sessionEmail) || null; },
    get favorites() { return cleanFavorites(this.user?.favorites); },
    persistenceAvailable: true,
    commit,
    setQuantity,
    toggleFavorite,
    setSession,
    reload() { data = loadData(); },
  };
})();
