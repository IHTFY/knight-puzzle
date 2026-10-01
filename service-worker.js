'use strict';

// Bump this version whenever a precached file changes.
const CACHE_PREFIX = 'knight-puzzle-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const FILES_TO_CACHE = [
  './index.html',
  './chessboard.js',
  './jquery.min.js',
  './main.js',
  './styles.css',
  './bulma@0.9.4.css',
  './manifest.json',
  './favicon.png',
  './images/pieces/wN.svg',
  './images/pieces/bQ.svg',
  // chessboard.js initializes its hidden drag image with a white pawn.
  './images/pieces/wP.svg',
  './images/128.png',
  './images/144.png',
  './images/152.png',
  './images/192.png',
  './images/256.png',
  './images/512.png',
];
const assetURLs = new Set(FILES_TO_CACHE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
  // Let an existing game finish before activating a new app version.
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
  if (!isAppNavigation && !assetURLs.has(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep the HTML and its assets on the same version, including while offline.
    const cached = await cache.match(isAppNavigation ? new URL('index.html', scope).href : event.request);
    return cached || fetch(event.request);
  })());
});
