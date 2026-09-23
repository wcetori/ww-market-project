import fs from 'node:fs/promises';
import vm from 'node:vm';

// Rebuild the human-readable attribution files from the reviewed photo manifest.
// No network calls, API keys or runtime dependencies.
const records = JSON.parse(await fs.readFile('assets/images/photo-licenses.json', 'utf8'));
const sources = JSON.parse(await fs.readFile('assets/images/photo-sources.json', 'utf8'));
const context = { window: {} };
context.WW = context.window.WW = {};
vm.runInNewContext(await fs.readFile('assets/js/products.js', 'utf8'), context);
const products = context.WW.products;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const markdown = value => String(value).replace(/[\[\]<>|]/g, character => `\\${character}`).replace(/\s+/g, ' ');
const totalBytes = records.reduce((sum, record) => sum + record.files.reduce((bytes, file) => bytes + file.bytes, 0), 0);

for (const source of sources) {
  if (!records.some(record => record.id === source.id && record.title === source.title)) throw new Error(`Missing current license for ${source.id}`);
}

const introduction = `# Фотографії: автори та ліцензії

У каталозі ${products.length} товарів і ${records.length} окремих фотографій Wikimedia Commons. Кожне фото має варіанти WebP 480 × 360 та 960 × 720 px. Загальний розмір: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB.

## Публікація на GitHub

Фотографії нижче поширюються за їхніми власними умовами: CC BY, CC BY-SA, CC0 або public-domain dedication (PD-self). Вони не стають вашим авторським твором і не переходять під загальну ліцензію коду.

Публікуйте цей файл разом із credits.html, assets/images/photo-licenses.json, assets/images/photo-source-metadata.json, assets/images/photo-sources.json і самими фотографіями. Не прибирайте посилання «Автор і ліцензія» з карток та підвала сайту.

- Для CC BY / CC BY-SA зберігайте ім’я автора, назву, посилання на джерело й конкретну версію ліцензії, а також опис змін.
- Підготовлені тут версії фотографій CC BY-SA поширюються під тією самою ліцензією, що й відповідний оригінал. На ці зображення не накладаються додаткові обмеження.
- CC0 та PD-self наведені окремо для кожного файлу; не застосовуйте ці позначення до інших фотографій.
- Для фото з кількома ліцензіями використовується конкретна ліцензія, вказана нижче.
- Бренди й моделі використані для ідентифікації техніки. Проєкт не заявляє про партнерство чи підтримку виробників або фотографів.

Зміни: зменшення без обрізання, нейтральні поля до пропорції 4:3, WebP quality 82, видалення вбудованих метаданих. Авторство та ліцензії збережено в супровідних файлах. Генеративні зображення для карток товарів не використовувалися. Раніше змінені файли (наприклад, cropped / transparent) зберігають назву й авторів джерела.

Інформацію перевірено за сторінками та метаданими джерел. Це не абсолютна гарантія відсутності претензій: [Wikimedia Commons також не гарантує правильність статусу кожного завантаження](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia). Інші права, зокрема на торговельні марки, можуть діяти окремо від авторського права на фото.

Логотип WW надано як референс користувачем і відтворено в попередній роботі. Його походження та права на початковий знак незалежно не перевірялися; ця добірка фотоліцензій на нього не поширюється. Див. THIRD_PARTY_NOTICES.md.

## Перелік фотографій
`;

const cards = [];
const sections = [];
for (const record of records) {
  const source = sources.find(source => source.id === record.id);
  const usedBy = products.filter(product => product.photoId === record.id).map(product => `${product.brand} ${product.name}`).join('; ');
  const details = [
    record.attribution && `Додаткова атрибуція: ${record.attribution}`,
    record.credit && `Походження: ${record.credit}`,
    record.copyrightNotice && `Повідомлення правовласника: ${record.copyrightNotice}`,
    record.restrictions && `Позначки джерела: ${record.restrictions}`,
  ].filter(Boolean);
  sections.push(`### ${record.id}

- Назва: ${markdown(record.title)}
- Автор: **${markdown(record.author)}**
- Джерело: [сторінка файлу](${record.source})
- Ліцензія: [${record.license}](${record.licenseUrl})
- Перевірено / завантажено: ${record.retrievedAt.slice(0, 10)}
- Використання: ${markdown(usedBy)}
- Файли: ${record.files.map(file => `\`${file.path}\``).join(', ')}
${source.note ? `- Відповідність моделі: ${markdown(source.note)}\n` : ''}${details.map(detail => `- ${markdown(detail)}\n`).join('')}- Зміни: ${record.changes}
`);
  cards.push(`      <article class="credit-card" id="${escape(record.id)}">
        <img src="${escape(record.files[0].path)}" alt="${escape(record.title)}" width="480" height="360" loading="lazy" decoding="async">
        <div class="credit-copy">
          <h2>${escape(record.title.replace(/^File:/, ''))}</h2>
          <p><strong>Автор:</strong> ${escape(record.author)}</p>
          <p><a href="${escape(record.source)}" target="_blank" rel="noopener">Оригінал та сторінка джерела ↗</a></p>
          <p><a href="${escape(record.licenseUrl)}" target="_blank" rel="noopener">${escape(record.license)}</a> · ${escape(record.retrievedAt.slice(0, 10))}</p>
          <p class="muted">Використано: ${escape(usedBy)}</p>
          ${source.note ? `<p class="credit-note">${escape(source.note)}</p>` : ''}
          ${details.map(detail => `<p class="muted">${escape(detail)}</p>`).join('\n          ')}
          <p class="muted">Зміни: зменшено без обрізання, додано поля 4:3, конвертовано у WebP, прибрано вбудовані метадані. Попередні зміни та співавтори зазначені в назві й даних джерела.</p>
          ${record.license.includes('BY-SA') ? `<p class="muted">Ці WebP-версії поширюються за ${escape(record.license)}.</p>` : ''}
        </div>
      </article>`);
}

await fs.writeFile('PHOTO_LICENSES.md', introduction + sections.join('\n'));
await fs.writeFile('credits.html', `<!DOCTYPE html>
<html lang="uk">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#101114">
    <title>Автори фотографій та ліцензії — WW Market</title>
    <link rel="icon" href="ww-logo.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/styles.css">
  </head>
  <body>
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="index.html" aria-label="WW Market — головна"><img src="ww-logo.svg" alt="WW Market Project" width="124" height="61"></a>
        <a class="button secondary" href="index.html#catalog">← До каталогу</a>
      </div>
    </header>
    <main class="container credits-page">
      <p class="eyebrow">ВІДКРИТІ ЛІЦЕНЗІЇ · СПРАВЖНІ ФОТОГРАФІЇ</p>
      <h1>Автори фото та джерела<span class="accent">.</span></h1>
      <p class="credits-intro">${records.length} фотографій Wikimedia Commons для ${products.length} демо-товарів. Дякуємо авторам, які дозволили повторне використання своїх робіт.</p>
      <div class="notice">Кожне фото має власну ліцензію. Зберігайте авторство, джерело та умови при копіюванні проєкту. Версії CC BY-SA залишаються під тією самою ліцензією. Ця сторінка не заявляє про підтримку магазину авторами фото або виробниками.</div>
      <p class="credits-intro">Фото споріднених моделей позначені в каталозі як ілюстрації. <a href="PHOTO_LICENSES.md">Повний перелік для GitHub</a> · <a href="assets/images/photo-licenses.json">Метадані та SHA-256 файлів</a></p>
      <div class="credits-grid">
${cards.join('\n')}
      </div>
    </main>
    <footer class="site-footer"><div class="container footer-inner"><a href="index.html">WW Market Project</a><a href="PHOTO_LICENSES.md">Умови повторного використання</a></div></footer>
  </body>
</html>
`);
console.log(`Attribution generated: ${records.length} photos, ${products.length} products, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB.`);
