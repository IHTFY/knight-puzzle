const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(scope = 'https://example.com/puzzle/') {
  const handlers = {};
  const stores = new Map([['static-cache-v1', new Map()], ['unrelated-app', new Map()]]);
  let claimed = false;
  let skipped = false;
  const requests = [];
  const context = vm.createContext({
    URL,
    Request: class { constructor(url, init) { this.url = new URL(url, scope).href; this.cache = init?.cache; } },
    self: {
      registration: { scope },
      skipWaiting: () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
      addEventListener: (name, fn) => handlers[name] = fn,
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async key => stores.delete(key),
      async open(key) {
        if (!stores.has(key)) stores.set(key, new Map());
        const entries = stores.get(key);
        return {
          async addAll(files) {
            for (const request of files) {
              requests.push(request);
              const file = './' + request.url.slice(scope.length);
              assert.ok(existsSync(path.join(__dirname, '..', file)), `Missing precached file: ${file}`);
              entries.set(request.url, `cached:${file}`);
            }
          },
          match: async request => entries.get(typeof request === 'string' ? request : request.url),
        };
      },
    },
    fetch: async () => { throw new Error('offline'); },
  });
  vm.runInContext(readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8'), context);
  return {
    stores, requests, claimed: () => claimed, skipped: () => skipped,
    message(data) { handlers.message({ data }); },
    lifecycle(name) { let promise; handlers[name]({ waitUntil: value => promise = value }); return promise; },
    request(url, mode = 'no-cors', method = 'GET') {
      let response;
      handlers.fetch({ request: { url: new URL(url, scope).href, mode, method }, respondWith: value => response = value });
      return response;
    },
  };
}

for (const scope of ['https://example.com/', 'https://example.com/puzzle/']) {
  test(`offline HTML, scripts, styles, icons, and pieces work at ${scope}`, async () => {
    const w = worker(scope);
    await w.lifecycle('install');
    await w.lifecycle('activate');
    assert.equal(await w.request('./?source=installed', 'navigate'), 'cached:./index.html');
    assert.equal(await w.request('./index.html', 'navigate'), 'cached:./index.html');
    for (const asset of ['main.js', 'jquery.min.js', 'chessboard.js', 'styles.css', 'manifest.json', 'favicon.ico', 'images/icon.svg', 'images/apple-touch-icon.png', 'images/icon-maskable-512.png', 'images/pieces/wN.svg', 'images/pieces/bQ.svg', 'images/pieces/wP.svg']) {
      assert.equal(await w.request(asset), `cached:./${asset}`);
    }
    assert.equal(await w.request('./manifest.json?v=2'), 'cached:./manifest.json');
    assert.ok(w.requests.every(request => request.cache === 'reload'), 'precache bypasses the HTTP cache');
    assert.equal(w.stores.has('static-cache-v1'), false);
    assert.equal(w.stores.has('unrelated-app'), true);
    assert.equal(w.claimed(), true);
    assert.equal(w.request('https://other.example/script.js'), undefined);
    assert.equal(w.request('./other-page', 'navigate'), undefined);
    assert.equal(w.request('./main.js', 'cors', 'POST'), undefined);
  });
}

test('waiting worker activates only when the page asks', () => {
  const w = worker();
  assert.equal(w.skipped(), false);
  w.message('something else');
  assert.equal(w.skipped(), false);
  w.message('skipWaiting');
  assert.equal(w.skipped(), true);
});

test('cache version matches the precached files (run `npm run stamp`)', () => {
  const { expectedVersion, currentVersion } = require('../scripts/stamp-service-worker.cjs');
  assert.equal(currentVersion(), expectedVersion());
});

test('manifest, page, and precache agree on icons', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const { precachedFiles } = require('../scripts/stamp-service-worker.cjs');
  const precached = precachedFiles(readFileSync(path.join(root, 'service-worker.js'), 'utf8'));
  for (const key of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) {
    assert.ok(manifest[key], `manifest.${key}`);
  }
  for (const purpose of ['any', 'maskable']) {
    for (const size of ['192x192', '512x512']) {
      assert.ok(manifest.icons.some(icon => icon.purpose === purpose && icon.sizes === size), `${purpose} ${size} icon`);
    }
  }
  for (const icon of manifest.icons) {
    const file = path.join(root, icon.src);
    assert.ok(existsSync(file), `Missing icon: ${icon.src}`);
    assert.ok(precached.includes(`./${icon.src}`), `Icon not precached: ${icon.src}`);
    if (icon.type === 'image/png') {
      const png = readFileSync(file);
      assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, `${icon.src} dimensions`);
    }
  }
  for (const shot of manifest.screenshots ?? []) {
    const png = readFileSync(path.join(root, shot.src));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, shot.sizes, `${shot.src} dimensions`);
  }
  for (const [, href] of html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)" href="([^"]+)"/g)) {
    assert.ok(precached.includes(`./${href}`), `Linked file not precached: ${href}`);
  }
  assert.match(html, new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"`));
});
