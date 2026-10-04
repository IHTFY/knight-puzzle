'use strict';

// Content hash of FILES_TO_CACHE; `npm run stamp` updates it and `npm test` fails if it is stale.
const CACHE_VERSION = '56079b2310fc';
const CACHE_PREFIX = 'knight-puzzle-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const FILES_TO_CACHE = [
  './index.html',
  './chessboard.js',
  './jquery.min.js',
  './main.js',
  './styles.css',
  './bulma@0.9.4.css',
  './manifest.json',
  './favicon.ico',
  './images/icon.svg',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-maskable-192.png',
  './images/icon-maskable-512.png',
  './images/apple-touch-icon.png',
  './images/pieces/wN.svg',
  './images/pieces/bQ.svg',
  // chessboard.js initializes its hidden drag image with a white pawn.
  './images/pieces/wP.svg',
];
const assetURLs = new Set(FILES_TO_CACHE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  // Bypass the HTTP cache so a new version never precaches stale files.
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(FILES_TO_CACHE.map(path => new Request(path, { cache: 'reload' })))
  ));
  // Don't skip waiting here: the page asks for it once no game is in progress.
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key =>
      (key.startsWith(CACHE_PREFIX) || key === 'static-cache-v1') && key !== CACHE_NAME
    ).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = self.registration.scope;
  const isAppNavigation = event.request.mode === 'navigate' &&
    (url.origin + url.pathname === scope || url.origin + url.pathname === new URL('index.html', scope).href);
  const assetURL = url.origin + url.pathname;
  if (!isAppNavigation && !assetURLs.has(assetURL)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep the HTML and its assets on the same version, including while offline.
    const cached = await cache.match(isAppNavigation ? new URL('index.html', scope).href : assetURL);
    return cached || fetch(event.request);
  })());
});
