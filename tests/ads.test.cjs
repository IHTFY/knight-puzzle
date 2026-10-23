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
let listeners;
let railSize;
let now;

const tick = () => new Promise((resolve) => setTimeout(resolve));
const box = () => ({ isConnected: true });
const showAd = (...args) => context.showAd(...args);

beforeEach(() => {
  added = [];
  shown = [];
  online = true;
  stored = {};
  cookie = '';
  listeners = {};
  railSize = [160, 600];
  now = 1_000_000;
  // Record script tags instead of fetching them; a fresh context has no loader request.
  context = vm.createContext({
    Error,
    Promise,
    Date: { now: () => now },
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
    window: {
      ihtfyAds: { show: (b, key) => shown.push([b, key]) },
      addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    },
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

// A box beside the board, as wide and tall as the stylesheet makes it in the current window.
function railBox() {
  const rail = {
    isConnected: true,
    dataset: {},
    get offsetWidth() { return railSize[0]; },
    get offsetHeight() { return railSize[1]; },
    cloneNode: () => Object.assign(railBox(), { dataset: { ...rail.dataset } }),
    replaceWith(next) { rail.isConnected = false; rail.next = next; },
  };
  return rail;
}
const fire = (type) => listeners[type]?.forEach((fn) => fn());
const shownKeys = () => shown.map(([b, key]) => [b.dataset.adSize, key]);

// Starts the ad beside the board and lets the first tap load it.
async function startAndTap(rail = railBox()) {
  context.startPlayAd(rail);
  fire('pointerdown');
  await tick();
  added[0].fire('load');
  await tick();
  return rail;
}

test('the ad beside the board waits for the first tap or key press', async () => {
  const rail = railBox();
  context.startPlayAd(rail);
  await tick();
  assert.equal(added.length, 0);
  fire('keydown');
  await tick();
  assert.equal(added.length, 1);
  added[0].fire('load');
  await tick();
  assert.deepEqual(shownKeys(), [['160x600', 'play/1']]);
  assert.equal(shown[0][0], rail.next);
  assert.equal(rail.next.dataset.adSlot, '6470163205');
});

test('a window too small for the ad beside the board loads nothing', async () => {
  railSize = [0, 0];
  context.startPlayAd(railBox());
  fire('pointerdown');
  await tick();
  assert.equal(added.length, 0);
});

test('a new run replaces the ad beside the board only after a minute', async () => {
  await startAndTap();
  now += 59_000;
  context.newPlayAd();
  await tick();
  assert.deepEqual(shownKeys(), [['160x600', 'play/1']]);
  now += 1_000;
  context.newPlayAd();
  await tick();
  assert.deepEqual(shownKeys(), [['160x600', 'play/1'], ['160x600', 'play/2']]);
  assert.notEqual(shown[1][0], shown[0][0]);
});

test('crossing into another ad size gets a new ad; resizing within one does not', async () => {
  await startAndTap();
  fire('resize');
  railSize = [300, 600];
  fire('resize');
  await tick();
  assert.deepEqual(shownKeys(), [['160x600', 'play/1'], ['300x600', 'play/2']]);
  railSize = [0, 0];
  fire('resize');
  await tick();
  assert.equal(shown.length, 2);
  assert.equal(shown[1][0].isConnected, false);
});

// The aside beside the board, after the app, holding a box.
function rail() {
  const app = { after(next) { app.next = next; } };
  const aside = {
    box: railBox(),
    previousElementSibling: app,
    app,
    querySelector: () => aside.box,
    remove() { aside.removed = true; },
  };
  return aside;
}

async function setUpForToken(valid) {
  stored['ihtfy-ad-free'] = 'token';
  context.window.ihtfyAds.adFree = async () => valid;
  const aside = rail();
  context.setUpPlayAd(aside);
  assert.equal(aside.removed, true);
  added[0].fire('load');
  await tick();
  fire('pointerdown');
  await tick();
  return aside;
}

test('a buyer gets no box beside the board', async () => {
  const aside = await setUpForToken(true);
  assert.equal(aside.app.next, undefined);
  assert.deepEqual(shown, []);
});

test('the box beside the board comes back when the token is not valid', async () => {
  const aside = await setUpForToken(false);
  assert.equal(aside.app.next, aside);
  assert.deepEqual(shownKeys(), [['160x600', 'play/1']]);
});
