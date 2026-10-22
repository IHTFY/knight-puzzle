const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// The ad code lives in main.js between markers.
const source = readFileSync(`${__dirname}/../main.js`, 'utf8').match(/\/\/ ads:start\n([\s\S]*?)\/\/ ads:end/)[1];
let added;
let shown;
let online;
let stored;
let cookie;
let context;

const tick = () => new Promise((resolve) => setTimeout(resolve));
const box = () => ({ isConnected: true });
const showAd = (...args) => context.showAd(...args);

beforeEach(() => {
  added = [];
  shown = [];
  online = true;
  stored = {};
  cookie = '';
  // Record script tags instead of fetching them; a fresh context has no loader request.
  context = vm.createContext({
    Error,
    Promise,
    document: {
      createElement: () => {
        const listeners = {};
        return { addEventListener: (name, fn) => (listeners[name] = fn), fire: (name) => listeners[name](), remove() {} };
      },
      head: { appendChild: (el) => added.push(el) },
      get cookie() { return cookie; },
    },
    localStorage: { getItem: (key) => stored[key] ?? null },
    navigator: { get onLine() { return online; } },
    window: { ihtfyAds: { show: (b, key) => shown.push([b, key]) } },
  });
  vm.runInContext(source, context);
});

test('loads the shared loader once, then hands it each box', async () => {
  const a = box();
  showAd(a, 'a');
  showAd(a, 'b');
  assert.equal(added.length, 1);
  assert.equal(added[0].src, 'https://ihtfy.com/ads/v1.js');
  added[0].fire('load');
  await tick();
  assert.deepEqual(shown, [[a, 'a'], [a, 'b']]);
});

test('skips a box that left the page before the loader arrived', async () => {
  const gone = box();
  const back = box();
  showAd(gone, 'a');
  gone.isConnected = false;
  showAd(back, 'a');
  added[0].fire('load');
  await tick();
  assert.deepEqual(shown, [[back, 'a']]);
});

test('loads nothing offline', () => {
  online = false;
  showAd(box(), 'a');
  assert.equal(added.length, 0);
});

test('stays quiet when the loader fails, and tries again on the next game over', async () => {
  showAd(box(), 'a');
  added[0].fire('error');
  await tick();
  assert.deepEqual(shown, []);
  showAd(box(), 'b');
  assert.equal(added.length, 2);
});

test('a box swapped out on close is skipped by a request still waiting on the loader', async () => {
  const old = { isConnected: true, cloneNode: () => ({ isConnected: false }), replaceWith(fresh) { old.isConnected = false; fresh.isConnected = true; } };
  showAd(old, 'a');
  const fresh = context.renewAdBox(old);
  added[0].fire('load');
  await tick();
  assert.equal(old.isConnected, false);
  assert.equal(fresh.isConnected, true);
  assert.deepEqual(shown, []);
});

test('loadForBuyer loads nothing for a visitor without an ad-free token', () => {
  context.loadForBuyer();
  assert.equal(added.length, 0);
});

test('loadForBuyer loads the loader at startup when localStorage holds a token', () => {
  stored['ihtfy-ad-free'] = 'token';
  context.loadForBuyer();
  assert.equal(added.length, 1);
  assert.equal(added[0].src, 'https://ihtfy.com/ads/v1.js');
  showAd(box(), 'a');
  assert.equal(added.length, 1);
});

test('loadForBuyer loads the loader at startup when only the cookie holds a token', () => {
  cookie = 'a=b; ihtfy-ad-free=token';
  context.loadForBuyer();
  assert.equal(added.length, 1);
});

test('loadForBuyer does nothing when storage and cookies cannot be read', () => {
  context.localStorage = { getItem: () => { throw new Error('blocked'); } };
  context.loadForBuyer();
  assert.equal(added.length, 0);
});

test('loadForBuyer still finds the cookie when storage cannot be read', () => {
  context.localStorage = { getItem: () => { throw new Error('blocked'); } };
  cookie = 'ihtfy-ad-free=token';
  context.loadForBuyer();
  assert.equal(added.length, 1);
});
