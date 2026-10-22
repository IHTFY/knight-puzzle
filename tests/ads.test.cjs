const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/../ads.js`, 'utf8');
let added;
let shown;
let online;
let context;

const tick = () => new Promise((resolve) => setTimeout(resolve));
const box = () => ({ isConnected: true });
const showAd = (...args) => context.showAd(...args);

beforeEach(() => {
  added = [];
  shown = [];
  online = true;
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
    },
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
