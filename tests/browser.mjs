import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../scripts/server.mjs';

// Dependency-free Chrome DevTools integration tests. Uses an isolated temporary profile.
const browserPath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
assert.ok(browserPath, 'Set BROWSER_PATH to an installed Chrome/Edge executable.');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-market-browser-'));
const artifacts = path.resolve('tests/artifacts');
await fs.mkdir(artifacts, { recursive: true });
const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(browserPath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const errors = [];
const pending = new Map();
let sequence = 0;

try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 20000);
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const origin = endpoint.replace('ws:', 'http:').split('/devtools/')[0];
  const targets = await (await fetch(`${origin}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  async function until(expression, message = expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    const diagnostics = await evaluate('JSON.stringify({ kind: window.WW?.ui?.dialogKind, error: document.getElementById("account-error")?.textContent, busy: document.getElementById("account-form")?.dataset.busy, ready: document.readyState })');
    throw new Error(`Timed out: ${message}; ${diagnostics}`);
  }

  async function click(selector) {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing element: ' + ${JSON.stringify(selector)}); el.click(); })()`);
  }

  async function fill(selector, value, event = 'input') {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
  }

  async function submit(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`); }
  async function check(name, callback) { await callback(); console.log(`PASS ${name}`); }
  async function close() { await click('[data-action="close-dialog"]'); }
  async function reload() {
    await send('Page.reload');
    await delay(150);
    await until('typeof WW !== "undefined" && WW.catalog && document.querySelectorAll(".product-card").length > 0');
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await until('typeof WW !== "undefined" && WW.catalog && document.querySelectorAll(".product-card").length === 12');

  await check('catalog pagination and sorting', async () => {
    await click('[data-action="load-more"]');
    assert.equal(await evaluate('document.querySelectorAll(".product-card").length'), 24);
    await fill('#sort', 'priceAsc', 'change');
    assert.equal(await evaluate('document.querySelector(".product-card").dataset.productId'), '23');
    await click('[data-action="reset-filters"]');
  });

  await check('search, category, brand, sale and price validation', async () => {
    await fill('#search', 'apple 256');
    await until('document.querySelectorAll(".product-card").length === 2');
    await click('#category-nav [data-category="Ноутбуки"]');
    assert.equal(await evaluate('document.querySelectorAll(".product-card").length'), 1);
    await click('[data-action="reset-filters"]');
    await click('[name="brand"][value="Sony"]');
    assert.equal(await evaluate('document.querySelectorAll(".product-card").length'), await evaluate('WW.products.filter(product => product.brand === "Sony").length'));
    await click('[data-action="reset-filters"]');
    await click('[data-action="show-sale"]');
    assert.equal(await evaluate('[...document.querySelectorAll(".product-card")].every(card => card.querySelector(".sale"))'), true);
    await fill('#min-price', '90000');
    await fill('#max-price', '100');
    assert.ok(await evaluate('document.getElementById("price-error").textContent.length > 0'));
    assert.equal(await evaluate('document.querySelectorAll(".product-card").length'), 0);
    await click('[data-action="reset-filters"]');
  });

  await check('guest favorites require an account', async () => {
    await click('.favorite-button');
    assert.equal(await evaluate('WW.store.favorites.length'), 0);
    assert.equal(await evaluate('WW.ui.dialogKind'), 'auth-login');
    await close();
    await click('[data-action="favorites"]');
    assert.equal(await evaluate('WW.ui.dialogKind'), 'auth-login');
    await close();
  });

  await check('product dialog, cart quantities, persistence, and Escape', async () => {
    await click('.product-name');
    assert.equal(await evaluate('document.querySelectorAll(".specs tr").length'), 5);
    await click('#dialog-content [data-action="add-cart"]');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until('!document.getElementById("app-dialog").open');
    await click('[data-action="cart"]');
    await click('[data-delta="1"]');
    assert.equal(await evaluate('WW.store.data.cart[0].qty'), 2);
    await close();
    await reload();
    assert.equal(await evaluate('WW.store.data.cart[0].qty'), 2);
    await click('[data-action="cart"]');
    await click('[data-delta="-1"]');
    assert.equal(await evaluate('WW.store.data.cart[0].qty'), 1);
  });

  await check('checkout validates phone and creates one persistent order', async () => {
    await click('[data-action="checkout"]');
    for (const [name, value] of Object.entries({ name: 'Тест Покупець', phone: '12345', email: 'guest@example.test', city: 'Київ', address: 'Пошта, відділення 12' })) await fill(`#checkout-form [name="${name}"]`, value);
    await submit('#checkout-form');
    assert.ok(await evaluate('document.getElementById("checkout-error").textContent.includes("номер")'));
    await fill('#checkout-form [name="phone"]', '+380 67 123 45 67');
    await submit('#checkout-form');
    assert.equal(await evaluate('WW.store.data.orders.length'), 1);
    assert.equal(await evaluate('WW.store.data.cart.length'), 0);
    await click('#dialog-content [data-action="orders"]');
    assert.equal(await evaluate('document.querySelectorAll(".order-card").length'), 1);
    await click('[data-action="repeat-order"]');
    assert.equal(await evaluate('WW.store.data.cart.length'), 1);
    await click('[data-action="remove-cart"]');
    assert.equal(await evaluate('WW.store.data.cart.length'), 0);
    await close();
  });

  let recovery;
  await check('registration hashes passwords and provides a recovery code', async () => {
    await click('[data-action="account"]');
    await click('[data-action="register"]');
    for (const [name, value] of Object.entries({ name: '<b>Олена</b>', email: 'demo@example.test', password: 'Test-password-123', confirm: 'Test-password-123' })) await fill(`#account-form [name="${name}"]`, value);
    await submit('#account-form');
    await until('WW.ui.dialogKind === "recovery-code"');
    recovery = await evaluate('document.querySelector(".recovery-code").textContent');
    assert.equal(recovery.length, 16);
    assert.equal(await evaluate('document.querySelector(".success-panel h3 b")'), null);
    assert.ok(await evaluate('!localStorage.getItem(WW.core.STORAGE_KEY).includes("Test-password-123")'));
    await click('#dialog-content [data-action="account"]');
    await click('[data-action="logout"]');
  });

  await check('wrong password is rejected; correct password logs in', async () => {
    await click('[data-action="account"]');
    await fill('#account-form [name="email"]', 'demo@example.test');
    await fill('#account-form [name="password"]', 'Wrong-password');
    await submit('#account-form');
    await until('document.getElementById("account-error").textContent.includes("Неправильний")');
    assert.equal(await evaluate('WW.store.user'), null);
    await fill('#account-form [name="password"]', 'Test-password-123');
    await submit('#account-form');
    await until('WW.ui.dialogKind === "profile"');
    await click('[data-action="logout"]');
  });

  await check('recovery code changes the password and old password no longer works', async () => {
    await click('[data-action="account"]');
    await click('[data-action="reset-password"]');
    for (const [name, value] of Object.entries({ email: 'demo@example.test', recovery, password: 'New-password-123', confirm: 'New-password-123' })) await fill(`#account-form [name="${name}"]`, value);
    await submit('#account-form');
    await until('WW.ui.dialogKind === "auth-login"');
    await fill('#account-form [name="email"]', 'demo@example.test');
    await fill('#account-form [name="password"]', 'Test-password-123');
    await submit('#account-form');
    await until('document.getElementById("account-error").textContent.includes("Неправильний")');
    await fill('#account-form [name="password"]', 'New-password-123');
    await submit('#account-form');
    await until('WW.ui.dialogKind === "profile"');
    await click('[data-action="logout"]');
  });

  await check('account favorites survive logout, reload and switching accounts', async () => {
    const login = async (email, password) => {
      await click('[data-action="account"]');
      await fill('#account-form [name="email"]', email);
      await fill('#account-form [name="password"]', password);
      await submit('#account-form');
      await until('WW.ui.dialogKind === "profile"');
      await close();
    };
    const logout = async () => {
      await click('[data-action="account"]');
      await click('[data-action="logout"]');
      assert.equal(await evaluate('WW.store.favorites.length'), 0);
      assert.equal(await evaluate('document.querySelectorAll(".favorite-button.active").length'), 0);
      assert.ok(await evaluate('document.getElementById("favorites-count").hidden'));
    };
    await login('demo@example.test', 'New-password-123');
    const firstId = await evaluate('Number(document.querySelector(".favorite-button").dataset.id)');
    await click('.favorite-button');
    assert.deepEqual(await evaluate('WW.store.favorites'), [firstId]);
    await reload();
    assert.deepEqual(await evaluate('WW.store.favorites'), [firstId]);
    await logout();
    await reload();
    await login('demo@example.test', 'New-password-123');
    assert.deepEqual(await evaluate('WW.store.favorites'), [firstId]);
    assert.equal(await evaluate('document.querySelectorAll(".favorite-button.active").length'), 1);
    await logout();

    await click('[data-action="account"]');
    await click('[data-action="register"]');
    for (const [name, value] of Object.entries({ name: 'Другий користувач', email: 'second@example.test', password: 'Second-password-123', confirm: 'Second-password-123' })) await fill(`#account-form [name="${name}"]`, value);
    await submit('#account-form');
    await until('WW.ui.dialogKind === "recovery-code"');
    await close();
    assert.equal(await evaluate('WW.store.favorites.length'), 0);
    const secondId = await evaluate('Number(document.querySelectorAll(".favorite-button")[1].dataset.id)');
    await evaluate('document.querySelectorAll(".favorite-button")[1].click()');
    assert.deepEqual(await evaluate('WW.store.favorites'), [secondId]);
    await logout();

    await login('demo@example.test', 'New-password-123');
    assert.deepEqual(await evaluate('WW.store.favorites'), [firstId]);
    await click('[data-action="favorites"]');
    assert.equal(await evaluate('document.querySelectorAll(".cart-item").length'), 1);
    await click('#dialog-content [data-action="toggle-favorite"]');
    assert.equal(await evaluate('WW.store.favorites.length'), 0);
    assert.ok(await evaluate('!!document.querySelector("#dialog-content .empty-state")'));
    await close();
    await logout();
    await login('second@example.test', 'Second-password-123');
    assert.deepEqual(await evaluate('WW.store.favorites'), [secondId]);
    await logout();
  });

  await check('corrupt stored data does not crash the storefront', async () => {
    await evaluate('localStorage.setItem(WW.core.STORAGE_KEY, "{bad json")');
    await reload();
    assert.equal(await evaluate('WW.store.data.cart.length'), 0);
  });

  await check('responsive layout, image fallback and dialog focus', async () => {
    await evaluate('(() => { const image = document.querySelector(".product-image-link img"); image.removeAttribute("srcset"); image.src = "/missing-image.png"; })()');
    await until('document.querySelector(".product-image-link img").dataset.fallback === "true"');
    await evaluate('WW.catalog.render()');
    for (const width of [320, 390, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 680 });
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Horizontal overflow at ${width}`);
      if (width === 390) {
        await click('[data-action="toggle-filters"]');
        assert.ok(await evaluate('document.getElementById("filters").classList.contains("expanded")'));
        await click('[data-action="toggle-filters"]');
      }
    }
    await click('[data-action="account"]');
    for (let i = 0; i < 9; i++) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.ok(await evaluate('document.getElementById("app-dialog").contains(document.activeElement)'));
    }
    await close();
    await evaluate('document.activeElement.blur()');
    await evaluate('scrollTo(0, 0)');
    await delay(800);
    const desktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(artifacts, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
    await evaluate('document.getElementById("catalog").scrollIntoView()');
    await delay(700);
    const catalog = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(artifacts, 'catalog.png'), Buffer.from(catalog.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
    await evaluate('scrollTo(0, 0)');
    await delay(300);
    const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(artifacts, 'mobile.png'), Buffer.from(mobile.data, 'base64'));
  });

  await check('all 48 products use local photos with attribution and responsive sources', async () => {
    await evaluate('WW.catalog.reset(); while (!document.getElementById("load-more").hidden) WW.catalog.loadMore();');
    assert.equal(await evaluate('document.querySelectorAll(".product-card").length'), 48);
    assert.equal(await evaluate('WW.core.categories.length - 1'), 11);
    assert.ok(await evaluate('WW.products.every(product => product.img.startsWith("assets/images/products/") && product.imgLarge.endsWith("-960.webp") && product.photoId)'));
    assert.equal(await evaluate('document.querySelectorAll(".product-card .photo-caption a").length'), 48);
    await evaluate('[...document.querySelectorAll(".product-image-link img")].forEach(image => image.loading = "eager")');
    await until('[...document.querySelectorAll(".product-image-link img")].every(image => image.complete && image.naturalWidth > 0 && !image.dataset.fallback)');
    for (const category of ['Планшети', 'Смартгодинники', 'Камери', 'Ігрові консолі', 'Мережеве обладнання', 'Побутова техніка']) {
      await evaluate(`WW.catalog.setCategory(${JSON.stringify(category)})`);
      assert.equal(await evaluate('document.querySelectorAll(".product-card").length'), 4);
    }
    await send('Page.navigate', { url: `${url}/credits.html` });
    await until('document.querySelectorAll(".credit-card").length === 46');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    assert.equal(await evaluate('[...document.querySelectorAll(".credit-card a")].filter(link => link.href.includes("creativecommons.org") || link.href.includes("Template:PD-self")).length'), 46);
  });

  await check('direct file opening loads scripts and cart without a server', async () => {
    await send('Page.navigate', { url: pathToFileURL(path.resolve('index.html')).href });
    await until('typeof WW !== "undefined" && WW.catalog && document.querySelectorAll(".product-card").length === 12');
    await click('.add-button');
    assert.equal(await evaluate('WW.store.data.cart.length'), 1);
    await click('[data-action="account"]');
    assert.ok(await evaluate('!!document.getElementById("account-form")'));
    assert.ok(await evaluate('!!crypto.subtle'));
    await close();
  });

  assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
  console.log('All browser checks passed. Screenshots: tests/artifacts/');
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  server.close();
  // The temporary isolated profile is intentionally left in OS temp for automatic cleanup.
}
