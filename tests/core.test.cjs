const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(saved = {}, blocked = false) {
  const memory = new Map(Object.entries(saved));
  const storage = {
    getItem(key) { if (blocked) throw new Error('Blocked'); return memory.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('Blocked'); memory.set(key, value); },
    removeItem(key) { memory.delete(key); },
  };
  const context = { window: {}, localStorage: storage, sessionStorage: storage };
  context.WW = context.window.WW = {};
  vm.createContext(context);
  for (const file of ['products', 'core']) vm.runInContext(fs.readFileSync(`assets/js/${file}.js`, 'utf8'), context);
  return context.WW;
}

const baseFilters = { category: 'all', search: '', min: 0, max: Infinity, brands: [], rating: 0, sale: false, sort: 'popular' };

test('multi-word search, category and price filters compose without mutating catalog', () => {
  const app = load();
  const original = app.products.map(product => product.id).join();
  const result = app.core.filterProducts(app.products, { ...baseFilters, search: 'APPLE 256', category: 'Ноутбуки', max: 50000 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
  assert.equal(app.products.map(product => product.id).join(), original);
});

test('price zero and reversed ranges return no results', () => {
  const app = load();
  assert.equal(app.core.filterProducts(app.products, { ...baseFilters, max: 0 }).length, 0);
  assert.equal(app.core.filterProducts(app.products, { ...baseFilters, min: 50000, max: 1000 }).length, 0);
});

test('popularity, price, rating and sale sorting follow their labels', () => {
  const app = load();
  for (const [sort, descending, key] of [['popular', true, 'reviews'], ['priceAsc', false, 'price'], ['priceDesc', true, 'price'], ['rating', true, 'rating']]) {
    const result = app.core.filterProducts(app.products, { ...baseFilters, sort });
    for (let i = 1; i < result.length; i++) assert.ok(descending ? result[i - 1][key] >= result[i][key] : result[i - 1][key] <= result[i][key]);
  }
  const sale = app.core.filterProducts(app.products, { ...baseFilters, sale: true, sort: 'discount' });
  assert.ok(sale.length > 0);
  assert.ok(sale.every(product => product.old > product.price));
  for (let i = 1; i < sale.length; i++) assert.ok(app.core.discount(sale[i - 1]) >= app.core.discount(sale[i]));
});

test('invalid stored data is ignored and legacy favorites/cart migrate', () => {
  const app = load({ ww_cart: JSON.stringify([{ id: 1, qty: 2 }, { id: 1, qty: 3 }, { id: 888, qty: 1 }, null, { id: 2, qty: -1 }]), ww_favs: '[1,1,999,2]' });
  assert.equal(JSON.stringify(app.store.data.cart), '[{"id":1,"qty":5}]');
  assert.equal(app.store.data.favorites.join(), '1,2');
  assert.equal(load({ ww_market_v2: '{bad json', ww_cart: '{}' }).store.data.cart.length, 0);
});

test('quantity is capped, invalid products ignored, zero removes and total recalculates', () => {
  const app = load();
  app.store.setQuantity(1, 2);
  assert.equal(app.core.cartTotal(), app.products[0].price * 2);
  app.store.setQuantity(1, 10000);
  assert.equal(app.store.data.cart[0].qty, 99);
  assert.equal(app.store.setQuantity(999, 1), false);
  app.store.setQuantity(1, 0);
  assert.equal(app.core.cartTotal(), 0);
});

test('unavailable storage preserves in-memory cart but rejects persistent transactions', () => {
  const app = load({}, true);
  assert.equal(app.store.setQuantity(1, 2), true);
  assert.equal(app.store.persistenceAvailable, false);
  assert.equal(app.store.commit({ ...app.store.data, cart: [] }, true), false);
  assert.equal(app.store.data.cart[0].qty, 2);
});

test('malformed accounts and order snapshots cannot break UI hydration', () => {
  const app = load({ ww_market_v2: JSON.stringify({ version: 2, cart: 'bad', favorites: null, accounts: [null, { name: '<script>' }], orders: [{ id: 'x', createdAt: 'yesterday', items: [{}] }] }) });
  assert.equal(app.store.data.accounts.length, 0);
  assert.equal(app.store.data.orders.length, 0);
  assert.equal(app.store.user, null);
});

test('favorites belong to individual accounts and survive logout and storage reload', () => {
  const account = email => ({ email, name: 'Demo', salt: 'a'.repeat(32), passwordHash: 'b'.repeat(64), recoveryHash: 'c'.repeat(64) });
  const app = load({ ww_market_v2: JSON.stringify({ version: 2, favorites: [3], accounts: [account('a@test.dev'), account('b@test.dev')] }) });
  assert.equal(app.store.toggleFavorite(1), false);
  assert.equal(app.store.favorites.length, 0);
  app.store.setSession('a@test.dev');
  assert.equal(app.store.favorites.length, 0, 'shared legacy favorites have no known owner');
  assert.equal(app.store.toggleFavorite(1), true);
  app.store.setSession('');
  assert.equal(app.store.favorites.length, 0);
  app.store.reload();
  app.store.setSession('b@test.dev');
  assert.equal(app.store.favorites.length, 0);
  app.store.toggleFavorite(2);
  app.store.setSession('a@test.dev');
  assert.equal(app.store.favorites.join(), '1');
  app.store.toggleFavorite(1);
  assert.equal(app.store.favorites.length, 0);
  app.store.setSession('b@test.dev');
  assert.equal(app.store.favorites.join(), '2');
});

test('favorite validation removes invalid IDs and failed writes preserve the saved list', () => {
  const account = { email: 'a@test.dev', name: 'Demo', salt: 'a'.repeat(32), passwordHash: 'b'.repeat(64), recoveryHash: 'c'.repeat(64), favorites: [1, 1, 999, null] };
  const saved = { ww_market_v2: JSON.stringify({ version: 2, accounts: [account] }), ww_market_session: account.email };
  assert.equal(load(saved).store.favorites.join(), '1');
  const blocked = load({}, true);
  blocked.store.commit({ ...blocked.store.data, accounts: [{ ...account, favorites: [1] }] });
  blocked.store.setSession(account.email);
  assert.equal(blocked.store.toggleFavorite(2), false);
  assert.equal(blocked.store.favorites.join(), '1');
});
