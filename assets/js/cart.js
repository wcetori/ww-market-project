'use strict';

/** Cart, saved favorites, guest checkout and persistent local order history. */
(() => {
  const { icon, image, escape, money } = WW.ui;

  function refresh() {
    WW.catalog.render();
    if (!WW.store.persistenceAvailable) WW.ui.toast('Браузер не дозволяє збереження. Зміни доступні до закриття сторінки.');
  }

  function add(id) {
    const current = WW.store.data.cart.find(item => item.id === id)?.qty || 0;
    if (current >= WW.core.MAX_QUANTITY) return WW.ui.toast('Максимум 99 одиниць одного товару.');
    if (!WW.store.setQuantity(id, current + 1)) return;
    refresh();
    if (WW.ui.dialogKind === 'favorites') openFavorites();
    WW.ui.toast(WW.store.persistenceAvailable ? 'Товар додано до кошика' : 'Додано. Збереження після закриття браузера недоступне.');
  }

  function changeQuantity(id, delta) {
    const current = WW.store.data.cart.find(item => item.id === id)?.qty || 0;
    WW.store.setQuantity(id, current + delta);
    refresh();
    openCart();
  }

  function remove(id) {
    WW.store.setQuantity(id, 0);
    refresh();
    openCart();
  }

  function toggleFavorite(id) {
    if (!WW.store.user) return requireAccount();
    if (!WW.store.toggleFavorite(id)) return WW.ui.toast('Не вдалося зберегти обране. Перевірте доступ до сховища браузера.');
    refresh();
    if (WW.ui.dialogKind === 'favorites') openFavorites();
    if (WW.ui.dialogKind === 'product') WW.catalog.refreshProduct();
  }

  function cartItem(item, favorite = false) {
    const product = WW.core.productMap.get(item.id);
    const inCart = WW.store.data.cart.some(entry => entry.id === item.id);
    return `
      <article class="cart-item">
        ${image(product, 'cart-item-image')}
        <div>
          <h3><button class="text-button" data-action="product" data-id="${product.id}">${escape(product.name)}</button></h3>
          <p class="cart-item-price">${money(product.price * (favorite ? 1 : item.qty))}</p>
          ${favorite ? `<button class="button ${inCart ? 'secondary' : 'primary'}" data-action="${inCart ? 'cart' : 'add-cart'}" data-id="${product.id}">${icon(inCart ? 'check' : 'bag')} ${inCart ? 'У кошику' : 'У кошик'}</button>` : `
            <div class="quantity"><button data-action="quantity" data-id="${product.id}" data-delta="-1" aria-label="Зменшити кількість ${escape(product.name)}">−</button><span aria-label="Кількість">${item.qty}</span><button data-action="quantity" data-id="${product.id}" data-delta="1" aria-label="Збільшити кількість ${escape(product.name)}" ${item.qty >= WW.core.MAX_QUANTITY ? 'disabled' : ''}>+</button></div>`}
        </div>
        <button class="remove-button" data-action="${favorite ? 'toggle-favorite' : 'remove-cart'}" data-id="${product.id}" aria-label="Видалити ${escape(product.name)}">${icon('trash')}</button>
      </article>`;
  }

  function openCart() {
    const cart = WW.store.data.cart;
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const savings = cart.reduce((sum, item) => {
      const product = WW.core.productMap.get(item.id);
      return sum + Math.max(0, (product.old || product.price) - product.price) * item.qty;
    }, 0);
    WW.ui.openDialog('cart', `Кошик${count ? ` · ${count}` : ''}`, cart.length ? `
      <div class="cart-list">${cart.map(item => cartItem(item)).join('')}</div>
      <div class="cart-summary">
        <div class="summary-row"><span>Кількість товарів</span><span>${count}</span></div>
        ${savings ? `<div class="summary-row"><span>Ваша економія</span><span>${money(savings)}</span></div>` : ''}
        <div class="summary-row total"><span>Разом</span><span>${money(WW.core.cartTotal())}</span></div>
        <button class="button primary full-width" data-action="checkout">Оформити замовлення ${icon('arrow-right')}</button>
        <p>Демонстрація без списання коштів.</p>
        <button class="text-button full-width" data-action="close-dialog">Продовжити покупки</button>
      </div>` : WW.ui.empty('Кошик чекає на твій вибір', 'Додай техніку, яка допоможе зробити більше.'), 'drawer-dialog');
  }

  function openFavorites() {
    if (!WW.store.user) return requireAccount();
    const favorites = WW.store.favorites;
    WW.ui.openDialog('favorites', `Обране · ${favorites.length}`, favorites.length
      ? `<p class="dialog-subtitle">Твоя добірка для наступного апгрейду.</p><div class="cart-list">${favorites.map(id => cartItem({ id }, true)).join('')}</div>`
      : WW.ui.empty('Збережи те, що сподобалось', 'Натисни на сердечко біля товару — він з’явиться тут.', 'close-dialog', 'Переглянути каталог', 'heart'), 'drawer-dialog');
  }

  function requireAccount() {
    WW.account.open('login');
    WW.ui.toast('Увійдіть або створіть акаунт, щоб зберігати своє обране.');
  }

  function checkout() {
    if (!WW.store.data.cart.length) return openCart();
    const user = WW.store.user;
    WW.ui.openDialog('checkout', 'Оформлення замовлення', `
      <p class="notice">Демо-замовлення збережеться в цьому браузері. Ми не списуємо кошти, не надсилаємо листи й не виконуємо доставку.</p>
      <form id="checkout-form">
        <div class="form-grid">
          <label class="field">Ім’я та прізвище<input name="name" autocomplete="name" required minlength="2" maxlength="80" value="${escape(user?.name || '')}" placeholder="Олексій Коваленко" autofocus></label>
          <label class="field">Телефон<input name="phone" type="tel" autocomplete="tel" required maxlength="20" placeholder="+380 67 123 45 67"></label>
        </div>
        <label class="field">Email<input name="email" type="email" autocomplete="email" required maxlength="254" value="${escape(user?.email || '')}" placeholder="you@example.com"></label>
        <div class="form-grid">
          <label class="field">Спосіб доставки<select name="delivery"><option value="branch">У відділення пошти</option><option value="courier">Кур’єром на адресу</option></select></label>
          <label class="field">Місто<input name="city" autocomplete="address-level2" required minlength="2" maxlength="80" placeholder="Київ"></label>
        </div>
        <label class="field"><span id="address-label">Номер відділення та назва пошти</span><input name="address" autocomplete="street-address" required minlength="2" maxlength="180" placeholder="Наприклад, Нова пошта, відділення 12"></label>
        <div class="summary-row total"><span>Сума товарів</span><span>${money(WW.core.cartTotal())}</span></div>
        <p class="dialog-subtitle">Оплата при отриманні · демонстраційний сценарій. Вартість реальної доставки не розраховується.</p>
        <p id="checkout-error" class="field-error" role="alert"></p>
        <button class="button primary full-width" type="submit">Створити демо-замовлення ${icon('check')}</button>
        <div class="form-footer"><button class="text-button" type="button" data-action="cart">Повернутися до кошика</button></div>
      </form>`);
  }

  function submitCheckout(form) {
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    const phone = fields.phone.replace(/[\s()\-]/g, '');
    const error = document.getElementById('checkout-error');
    if (!/^(?:\+?38)?0\d{9}$/.test(phone)) {
      error.textContent = 'Введіть український номер телефону: +380 та 9 цифр або 0 та 9 цифр.';
      form.elements.phone.focus();
      return;
    }
    for (const key of ['name', 'city', 'address']) {
      if (fields[key].trim().length < 2) {
        error.textContent = 'Заповніть ім’я, місто та адресу — щонайменше 2 символи.';
        form.elements[key].focus();
        return;
      }
    }
    const cart = WW.store.data.cart;
    if (!cart.length) return openCart();
    const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
    const order = {
      id: `WW-${Date.now().toString(36).toUpperCase()}-${random}`,
      createdAt: new Date().toISOString(),
      name: fields.name.trim(),
      email: fields.email.trim().toLowerCase(),
      ownerEmail: WW.store.user?.email || null,
      phone,
      city: fields.city.trim(),
      address: fields.address.trim(),
      delivery: fields.delivery,
      items: cart.map(item => ({ ...item, name: WW.core.productMap.get(item.id).name, price: WW.core.productMap.get(item.id).price })),
      total: WW.core.cartTotal(),
    };
    // Persist order and empty cart together; never clear a cart when storage fails.
    const saved = WW.store.commit({ ...WW.store.data, orders: [order, ...WW.store.data.orders].slice(0, 100), cart: [] }, true);
    if (!saved) {
      error.textContent = 'Не вдалося зберегти замовлення. Дозвольте сховищу браузера запис даних або звільніть місце. Кошик збережено.';
      return;
    }
    refresh();
    WW.ui.openDialog('success', 'Готово!', `
      <div class="success-panel"><div class="success-symbol">${icon('check')}</div><h3>Демо-замовлення створено</h3><p>${escape(order.id)}<br>Сума: ${money(order.total)}</p><p>Воно збережене в історії цього браузера. Реальні оплата й доставка не виконуються.</p><button class="button primary full-width" data-action="orders">Переглянути замовлення ${icon('arrow-right')}</button><div class="form-footer"><button class="text-button" data-action="close-dialog">Продовжити покупки</button></div></div>`);
  }

  function openOrders() {
    const user = WW.store.user;
    const orders = WW.store.data.orders.filter(order => user ? order.ownerEmail === user.email : !order.ownerEmail);
    WW.ui.openDialog('orders', 'Мої замовлення', `
      <p class="notice">${user ? 'Демо-замовлення цього акаунта' : 'Гостьові демо-замовлення'} у цьому браузері. Вони не надсилаються продавцю.</p>
      ${orders.length ? orders.map(order => `
        <article class="order-card">
          <div class="order-top"><strong>${escape(order.id)}</strong><span>${new Date(order.createdAt).toLocaleDateString('uk-UA')}</span></div>
          <ul class="order-items">${order.items.map(item => `<li>${escape(item.name)} × ${item.qty} — ${money(item.price * item.qty)}</li>`).join('')}</ul>
          <div class="summary-row total"><span>Разом</span><span>${money(order.total)}</span></div>
          <p>${escape(order.city)}, ${escape(order.address)} · ${order.delivery === 'courier' ? 'Кур’єром' : 'У відділення'}</p>
          <button class="text-button" data-action="repeat-order" data-order="${escape(order.id)}">Додати товари до кошика ще раз ↗</button>
        </article>`).join('') : WW.ui.empty('Тут буде історія покупок', 'Створи перше демо-замовлення, щоб побачити його тут.', 'close-dialog', 'До каталогу', 'box')}`);
  }

  function repeatOrder(id) {
    const user = WW.store.user;
    const order = WW.store.data.orders.find(item => item.id === id && (user ? item.ownerEmail === user.email : !item.ownerEmail));
    if (!order) return;
    const cart = WW.core.cleanCart([...WW.store.data.cart, ...order.items]);
    WW.store.commit({ ...WW.store.data, cart });
    refresh();
    openCart();
    WW.ui.toast('Товари додано за поточними цінами каталогу.');
  }

  WW.cart = { add, changeQuantity, remove, toggleFavorite, openCart, openFavorites, checkout, submitCheckout, openOrders, repeatOrder };
})();
