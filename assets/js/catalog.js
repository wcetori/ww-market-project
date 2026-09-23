'use strict';

/** Catalog filtering, pagination, product cards and product details. */
(() => {
  const { icon, escape, money, image } = WW.ui;
  const PAGE_SIZE = 12;
  const filters = { category: 'all', search: '', min: 0, max: Infinity, brands: [], rating: 0, sale: false, sort: 'popular' };
  let limit = PAGE_SIZE;
  let activeProductId = null;

  function renderNavigation() {
    document.getElementById('category-nav').innerHTML = WW.core.categories.map(category => `
      <button class="category-link ${filters.category === category.value && !filters.sale ? 'active' : ''}"
        data-action="category" data-category="${category.value}" aria-pressed="${filters.category === category.value && !filters.sale}">
        ${icon(category.icon)} ${category.name}
      </button>`).join('') + `
      <button class="category-link ${filters.sale ? 'active' : ''}" data-action="show-sale" aria-pressed="${filters.sale}">${icon('tag')} Вигідні пропозиції</button>`;

    document.getElementById('category-filters').innerHTML = WW.core.categories.map(category => {
      const count = WW.products.filter(product => category.value === 'all' || product.cat === category.value).length;
      return `<button class="category-filter ${filters.category === category.value ? 'active' : ''}" data-action="category" data-category="${category.value}" aria-pressed="${filters.category === category.value}">${category.name}<span>${count}</span></button>`;
    }).join('');
  }

  function renderBrands() {
    document.getElementById('brand-filters').innerHTML = [...new Set(WW.products.map(product => product.brand))].sort().map(brand => `
      <label class="checkbox"><input type="checkbox" name="brand" value="${brand}" ${filters.brands.includes(brand) ? 'checked' : ''}><span>${brand}</span><span class="count">${WW.products.filter(product => product.brand === brand).length}</span></label>
    `).join('');
  }

  function rating(product) {
    return `<div class="rating"><span class="star" aria-label="Рейтинг">★</span><span>${product.rating.toFixed(1)}</span><span class="rating-count">(${product.reviews}) · демо</span></div>`;
  }

  function card(product) {
    const favorite = WW.store.favorites.includes(product.id);
    const inCart = WW.store.data.cart.some(item => item.id === product.id);
    const discount = WW.core.discount(product);
    return `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-visual">
          ${discount ? `<span class="product-badge sale">−${discount}%</span>` : `<span class="product-badge">${product.rating >= 4.9 ? 'TOP RATED' : 'WW SELECT'}</span>`}
          <button class="favorite-button ${favorite ? 'active' : ''}" data-action="toggle-favorite" data-id="${product.id}" aria-label="${favorite ? 'Прибрати з обраного' : 'Додати в обране'}: ${escape(product.name)}" aria-pressed="${favorite}">${icon('heart')}</button>
          <button class="product-image-link" data-action="product" data-id="${product.id}" aria-label="Переглянути ${escape(product.name)}">${image(product)}</button>
          <div class="photo-caption"><span>${product.photoNote ? 'Фото-ілюстрація' : 'Фото товару'}</span><a href="credits.html#${escape(product.photoId)}" target="_blank" rel="noopener" aria-label="Автор і ліцензія фото ${escape(product.name)}">Автор і ліцензія ↗</a></div>
        </div>
        <div class="product-info">
          <p class="product-category">${product.brand} / ${product.cat}</p>
          <button class="product-name" data-action="product" data-id="${product.id}">${escape(product.name)}</button>
          ${rating(product)}
          <p class="product-spec">${escape(Object.values(product.spec).slice(0, 2).join(' / '))}</p>
          <div class="product-bottom">
            <div><span class="old-price">${discount ? money(product.old) : ''}</span><span class="price">${new Intl.NumberFormat('uk-UA').format(product.price)} <span class="currency">₴</span></span></div>
            <button class="add-button ${inCart ? 'in-cart' : ''}" data-action="${inCart ? 'cart' : 'add-cart'}" data-id="${product.id}" aria-label="${inCart ? 'Відкрити кошик' : 'Додати в кошик'}: ${escape(product.name)}">${icon(inCart ? 'check' : 'bag')}</button>
          </div>
          <p class="stock">${icon('check')} Доступно в демо-каталозі</p>
        </div>
      </article>`;
  }

  function renderChips() {
    const chips = [];
    if (filters.category !== 'all') chips.push(['category', filters.category]);
    if (filters.search) chips.push(['search', `Пошук: ${filters.search}`]);
    if (filters.min > 0) chips.push(['min', `Від ${money(filters.min)}`]);
    if (Number.isFinite(filters.max)) chips.push(['max', `До ${money(filters.max)}`]);
    for (const brand of filters.brands) chips.push([`brand:${brand}`, brand]);
    if (filters.rating) chips.push(['rating', '★ 4.8+']);
    if (filters.sale) chips.push(['sale', 'Зі знижкою']);
    document.getElementById('active-filters').innerHTML = chips.map(([key, text]) => `
      <button class="filter-chip" data-action="remove-filter" data-filter="${escape(key)}" aria-label="Зняти фільтр ${escape(text)}">${escape(text)} ${icon('close')}</button>
    `).join('');
  }

  function render() {
    const products = WW.core.filterProducts(WW.products, filters);
    document.getElementById('products').innerHTML = products.length
      ? products.slice(0, limit).map(card).join('')
      : WW.ui.empty('Поки нічого не знайшли', 'Спробуйте інший запит або змініть фільтри.', 'reset-filters', 'Скинути фільтри', 'search');
    document.getElementById('result-count').innerHTML = `Знайдено товарів: <strong>${products.length}</strong>`;
    document.getElementById('shown-count').textContent = `Показано ${Math.min(limit, products.length)} із ${products.length} товарів`;
    document.getElementById('load-more').hidden = products.length <= limit;
    document.getElementById('price-error').textContent = filters.min > filters.max ? 'Ціна «Від» має бути меншою за «До».' : '';
    renderChips();
    WW.ui.updateHeader();
  }

  function syncControls() {
    document.getElementById('search').value = filters.search;
    document.getElementById('min-price').value = filters.min || '';
    document.getElementById('max-price').value = Number.isFinite(filters.max) ? filters.max : '';
    document.getElementById('rating-filter').checked = Boolean(filters.rating);
    document.getElementById('sale-filter').checked = filters.sale;
    document.getElementById('sort').value = filters.sort;
    renderNavigation();
    renderBrands();
  }

  function applyControls() {
    filters.search = document.getElementById('search').value.trim();
    filters.min = Math.max(0, Number(document.getElementById('min-price').value) || 0);
    const maximum = document.getElementById('max-price').value;
    filters.max = maximum === '' ? Infinity : Math.max(0, Number(maximum));
    filters.brands = [...document.querySelectorAll('[name="brand"]:checked')].map(input => input.value);
    filters.rating = document.getElementById('rating-filter').checked ? 4.8 : 0;
    filters.sale = document.getElementById('sale-filter').checked;
    filters.sort = document.getElementById('sort').value;
    limit = PAGE_SIZE;
    renderNavigation();
    render();
  }

  function setCategory(category) {
    if (!WW.core.categories.some(item => item.value === category)) return;
    filters.category = category;
    filters.sale = false;
    limit = PAGE_SIZE;
    syncControls();
    render();
    document.getElementById('catalog').scrollIntoView({ block: 'start' });
  }

  function reset() {
    Object.assign(filters, { category: 'all', search: '', min: 0, max: Infinity, brands: [], rating: 0, sale: false, sort: 'popular' });
    limit = PAGE_SIZE;
    syncControls();
    render();
  }

  function removeFilter(key) {
    if (key.startsWith('brand:')) filters.brands = filters.brands.filter(brand => brand !== key.slice(6));
    else if (key === 'category') filters.category = 'all';
    else if (key === 'search') filters.search = '';
    else if (key === 'min') filters.min = 0;
    else if (key === 'max') filters.max = Infinity;
    else if (key === 'rating') filters.rating = 0;
    else if (key === 'sale') filters.sale = false;
    limit = PAGE_SIZE;
    syncControls();
    render();
  }

  function openProduct(id) {
    const product = WW.core.productMap.get(id);
    if (!product) return;
    activeProductId = id;
    const favorite = WW.store.favorites.includes(id);
    WW.ui.openDialog('product', 'Деталі товару', `
      <div class="product-detail">
        <div class="detail-image">${image(product, '', false)}</div>
        <div class="detail-copy">
          <p class="product-category">${product.brand} / Артикул WW-${String(id).padStart(4, '0')}</p>
          <h3>${escape(product.name)}</h3>
          ${rating(product)}
          <p class="stock">${icon('check')} Доступно в демо-каталозі</p>
          <div class="price">${product.old ? `<span class="old-price">${money(product.old)}</span>` : ''}${money(product.price)}</div>
          <div class="detail-actions"><button class="button primary" data-action="add-cart" data-id="${id}">${icon('bag')} У кошик</button><button class="button secondary" data-action="toggle-favorite" data-id="${id}" aria-label="${favorite ? 'Прибрати з обраного' : 'Додати в обране'}" aria-pressed="${favorite}">${icon('heart')}</button></div>
          <p class="detail-note">${escape(product.photoNote || 'Колір і комплектація на фото можуть відрізнятися.')} Ціни, характеристики й оцінки — демонстраційні дані.</p>
          <a class="photo-license-link" href="credits.html#${escape(product.photoId)}" target="_blank" rel="noopener">Автор, джерело та ліцензія фотографії ↗</a>
        </div>
      </div>
      <table class="specs"><caption>Характеристики</caption><tbody>${Object.entries(product.spec).map(([name, value]) => `<tr><th scope="row">${escape(name)}</th><td>${escape(value)}</td></tr>`).join('')}</tbody></table>
    `, 'product-dialog');
  }

  WW.catalog = {
    init() { syncControls(); render(); },
    render, applyControls, setCategory, reset, removeFilter, openProduct,
    refreshProduct() { if (activeProductId) openProduct(activeProductId); },
    loadMore() { limit += PAGE_SIZE; render(); },
    showSale() { reset(); filters.sale = true; syncControls(); render(); document.getElementById('catalog').scrollIntoView(); },
  };
})();
