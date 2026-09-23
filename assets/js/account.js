'use strict';

/** Local demo accounts. Browser data is not a substitute for server authentication. */
(() => {
  const { escape, icon } = WW.ui;
  const iterations = 210000;

  function randomHex(bytes = 16) {
    return [...crypto.getRandomValues(new Uint8Array(bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashSecret(secret, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
    return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function open(mode = 'login') {
    if (WW.store.user && mode === 'login') return profile();
    const register = mode === 'register';
    const reset = mode === 'reset';
    WW.ui.openDialog(`auth-${mode}`, reset ? 'Відновлення доступу' : 'Особистий кабінет', `
      <p class="notice">Локальний демо-акаунт лише для цього браузера. Використовуйте тестові дані та окремий пароль. Листи не надсилаються.</p>
      ${reset ? '<p class="dialog-subtitle">Введіть код відновлення, який ви отримали під час реєстрації.</p>' : `
        <div class="form-tabs" aria-label="Вхід або реєстрація"><button class="${register ? '' : 'active'}" data-action="login" aria-pressed="${!register}">Вхід</button><button class="${register ? 'active' : ''}" data-action="register" aria-pressed="${register}">Реєстрація</button></div>`}
      <form id="account-form" data-mode="${mode}">
        ${register ? '<label class="field">Ім’я<input name="name" autocomplete="given-name" required minlength="2" maxlength="60" placeholder="Ваше ім’я" autofocus></label>' : ''}
        <label class="field">Email<input name="email" type="email" autocomplete="username" required maxlength="254" placeholder="you@example.com" ${register ? '' : 'autofocus'}></label>
        ${reset ? '<label class="field">Код відновлення<input name="recovery" required minlength="16" maxlength="20" placeholder="Код, збережений під час реєстрації" autocomplete="off"></label>' : ''}
        <label class="field">${reset ? 'Новий пароль' : 'Пароль'}<input name="password" type="password" autocomplete="${register || reset ? 'new-password' : 'current-password'}" required minlength="8" maxlength="128" placeholder="Щонайменше 8 символів"></label>
        ${register || reset ? '<label class="field">Повторіть пароль<input name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="Ще раз той самий пароль"></label>' : ''}
        <p class="field-error" id="account-error" role="alert"></p>
        <button class="button primary full-width" type="submit">${register ? 'Створити демо-акаунт' : reset ? 'Змінити пароль' : 'Увійти'} ${icon('arrow-right')}</button>
        <div class="form-footer"><button class="text-button" type="button" data-action="${reset ? 'login' : 'reset-password'}">${reset ? 'Повернутися до входу' : 'Забули пароль?'}</button></div>
      </form>`);
  }

  function profile() {
    const user = WW.store.user;
    if (!user) return open();
    const count = WW.store.data.orders.filter(order => order.ownerEmail === user.email).length;
    WW.ui.openDialog('profile', 'Особистий кабінет', `
      <div class="profile-card"><div class="avatar">${escape(user.name.charAt(0).toUpperCase())}</div><div><h3>${escape(user.name)}</h3><p>${escape(user.email)}</p></div></div>
      <p class="notice">Локальний демо-профіль. Дані залишаються у цьому браузері; після очищення сховища вони будуть видалені.</p>
      <div class="profile-actions"><button class="button secondary" data-action="orders">${icon('box')} Мої замовлення · ${count}</button><button class="button secondary" data-action="favorites">${icon('heart')} Моє обране · ${WW.store.favorites.length}</button><button class="button secondary" data-action="reset-password">Змінити пароль за кодом відновлення</button><button class="button secondary" data-action="logout">${icon('logout')} Вийти з акаунта</button></div>`);
  }

  async function submit(form) {
    if (form.dataset.busy || !form.reportValidity()) return;
    const error = document.getElementById('account-error');
    const fields = Object.fromEntries(new FormData(form));
    const mode = form.dataset.mode;
    const email = fields.email.trim().toLowerCase();
    const submitButton = form.querySelector('[type="submit"]');
    const fail = message => { if (error.isConnected) error.textContent = message; };
    error.textContent = '';
    if (!crypto.subtle) return fail('Для акаунтів відкрийте сайт через localhost або HTTPS. Каталог і кошик працюють без входу.');
    if (fields.confirm !== undefined && fields.password !== fields.confirm) return fail('Паролі не збігаються.');
    if (mode === 'register' && fields.name.trim().length < 2) return fail('Введіть ім’я — щонайменше 2 символи.');
    form.dataset.busy = 'true';
    submitButton.disabled = true;
    try {
      const account = WW.store.data.accounts.find(item => item.email === email);
      if (mode === 'register') {
        if (account) return fail('Акаунт із цим email уже існує в цьому браузері. Увійдіть або відновіть пароль.');
        const salt = randomHex();
        const recovery = randomHex(8).toUpperCase();
        const [passwordHash, recoveryHash] = await Promise.all([hashSecret(fields.password, salt), hashSecret(recovery, salt)]);
        const created = { email, name: fields.name.trim(), salt, passwordHash, recoveryHash, favorites: [] };
        if (WW.store.data.accounts.some(item => item.email === email)) return fail('Акаунт уже створений. Перейдіть до входу.');
        if (!WW.store.commit({ ...WW.store.data, accounts: [...WW.store.data.accounts, created] }, true)) {
          return fail('Браузер не дозволяє зберегти акаунт. Увімкніть локальне сховище або звільніть місце.');
        }
        WW.store.setSession(email);
        WW.catalog.render();
        if (form.isConnected) {
          WW.ui.openDialog('recovery-code', 'Акаунт створено', `
            <div class="success-panel"><div class="success-symbol">${icon('check')}</div><h3>Привіт, ${escape(created.name)}!</h3><p>Збережіть цей код для відновлення пароля. Він показується лише зараз.</p><code class="recovery-code">${recovery}</code><p>Відновлення через email у демо-магазині недоступне.</p><button class="button primary full-width" data-action="account">Я зберіг код ${icon('arrow-right')}</button></div>`);
        }
      } else if (mode === 'login') {
        if (!account || await hashSecret(fields.password, account.salt) !== account.passwordHash) {
          return fail('Неправильний email або пароль. Акаунт має бути створений у цьому браузері.');
        }
        WW.store.setSession(email);
        WW.catalog.render();
        if (form.isConnected) profile();
      } else if (mode === 'reset') {
        const recovery = fields.recovery.replace(/[\s-]/g, '').toUpperCase();
        if (!account || await hashSecret(recovery, account.salt) !== account.recoveryHash) {
          return fail('Email або код відновлення неправильний.');
        }
        const passwordHash = await hashSecret(fields.password, account.salt);
        const accounts = WW.store.data.accounts.map(item => item.email === email ? { ...item, passwordHash } : item);
        if (!WW.store.commit({ ...WW.store.data, accounts }, true)) return fail('Не вдалося зберегти пароль. Перевірте доступ до локального сховища.');
        WW.store.setSession('');
        WW.catalog.render();
        if (form.isConnected) { open('login'); WW.ui.toast('Пароль змінено. Увійдіть із новим паролем.'); }
      }
    } catch {
      fail('Не вдалося виконати дію. Спробуйте ще раз у сучасному браузері.');
    } finally {
      delete form.dataset.busy;
      submitButton.disabled = false;
    }
  }

  function logout() {
    WW.store.setSession('');
    WW.catalog.render();
    WW.ui.closeDialog();
    WW.ui.toast('Ви вийшли з демо-акаунта.');
  }

  WW.account = { open, profile, submit, logout };
})();
