const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(scope = 'https://example.com/puzzle/') {
  const handlers = {};
  const stores = new Map([['static-cache-v1', new Map()], ['unrelated-app', new Map()]]);
  let claimed = false;
  const context = vm.createContext({
    URL,
    self: {
      registration: { scope },
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
            for (const file of files) {
              assert.ok(existsSync(path.join(__dirname, '..', file)), `Missing precached file: ${file}`);
              entries.set(new URL(file, scope).href, `cached:${file}`);
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
    stores, claimed: () => claimed,
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
    for (const asset of ['main.js', 'jquery.min.js', 'chessboard.js', 'styles.css', 'bulma@0.9.4.css', 'manifest.json', 'images/pieces/wN.svg', 'images/pieces/bQ.svg', 'images/pieces/wP.svg', 'images/192.png']) {
      assert.equal(await w.request(asset), `cached:./${asset}`);
    }
    assert.equal(w.stores.has('static-cache-v1'), false);
    assert.equal(w.stores.has('unrelated-app'), true);
    assert.equal(w.claimed(), true);
    assert.equal(w.request('https://other.example/script.js'), undefined);
    assert.equal(w.request('./other-page', 'navigate'), undefined);
    assert.equal(w.request('./main.js', 'cors', 'POST'), undefined);
  });
}
