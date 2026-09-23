const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const context = { window: {} };
context.WW = context.window.WW = {};
vm.runInNewContext(fs.readFileSync('assets/js/products.js', 'utf8'), context);
const products = context.WW.products;
const sources = JSON.parse(fs.readFileSync('assets/images/photo-sources.json', 'utf8'));
const licenses = JSON.parse(fs.readFileSync('assets/images/photo-licenses.json', 'utf8'));
const metadata = JSON.parse(fs.readFileSync('assets/images/photo-source-metadata.json', 'utf8'));

test('expanded catalog has unique IDs and every product maps to licensed local photos', () => {
  assert.equal(products.length, 48);
  assert.equal(new Set(products.map(product => product.id)).size, products.length);
  assert.equal(new Set(products.map(product => product.cat)).size, 11);
  for (const product of products) {
    const license = licenses.find(record => record.id === product.photoId);
    assert.ok(license, `Missing license: ${product.name}`);
    assert.ok(license.files.some(file => file.path === product.img));
    assert.ok(license.files.some(file => file.path === product.imgLarge));
    assert.ok(sources.find(source => source.id === product.photoId).productIds.includes(product.id));
  }
});

test('all shipped photos have explicit redistribution terms, source and author', () => {
  assert.equal(sources.length, 46);
  assert.equal(licenses.length, sources.length);
  for (const license of licenses) {
    assert.match(license.license, /^(CC BY(?:-SA)? (2\.0|3\.0|4\.0)|CC0|Public domain)$/);
    assert.ok(license.author.trim());
    assert.match(license.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(license.licenseUrl, /^https?:\/\/(creativecommons\.org\/(licenses|publicdomain)\/|commons\.wikimedia\.org\/wiki\/Template:PD-self)/);
    assert.ok(license.changes.includes('WebP'));
    const source = sources.find(source => source.id === license.id);
    assert.equal(source.title, license.title);
    assert.ok(metadata.some(page => page.title === license.title));
  }
});

test('WebP files match published digests and the complete photo set stays under 5 MiB', () => {
  let total = 0;
  const referenced = new Set();
  for (const license of licenses) {
    assert.equal(license.files.length, 2);
    for (const file of license.files) {
      const bytes = fs.readFileSync(file.path);
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
      assert.equal(bytes.length, file.bytes);
      assert.ok(bytes.length < 220 * 1024, `Oversized photo: ${file.path}`);
      total += bytes.length;
      referenced.add(file.path.split('/').at(-1));
    }
  }
  assert.ok(total < 5 * 1024 * 1024);
  assert.equal(fs.readdirSync('assets/images/products').filter(file => !referenced.has(file)).length, 0);
});

test('attribution page covers every photo and publication keeps license notices', () => {
  const credits = fs.readFileSync('credits.html', 'utf8');
  const notices = fs.readFileSync('PHOTO_LICENSES.md', 'utf8');
  for (const source of sources) {
    assert.ok(credits.includes(`id="${source.id}"`));
    assert.ok(notices.includes(`### ${source.id}`));
  }
  assert.ok(fs.readFileSync('index.html', 'utf8').includes('href="credits.html"'));
  assert.ok(fs.existsSync('.nojekyll'));
});
