/**
 * Service Worker v1.2
 * Deployment: https://mahles47.github.io/Quran-kareem/
 *
 * IMPORTANT: SHELL_ASSETS use absolute paths matching the repo subpath.
 * start_url and scope in manifest.json are also absolute.
 * This is the only reliable way to make Chrome trigger the install
 * prompt on a GitHub Pages subpath deployment.
 */
'use strict';

const SHELL_CACHE = 'mushaf-shell-v2';
const FONT_CACHE  = 'mushaf-fonts-v1';

const SHELL_ASSETS = [
  '/Quran-kareem/',
  '/Quran-kareem/index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-regular-400.woff2',
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/* ── INSTALL ─────────────────────────────────────────────────────── */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing v1.2');
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return Promise.allSettled(
        SHELL_ASSETS.map(function(url) {
          return cache.add(new Request(url, { cache: 'reload' }))
            .catch(function(err) {
              console.warn('[SW] Could not pre-cache:', url, err);
            });
        })
      );
    }).then(function() {
      console.log('[SW] Pre-cache done');
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE ────────────────────────────────────────────────────── */
self.addEventListener('activate', function(event) {
  var VALID = [SHELL_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return !VALID.includes(k); })
            .map(function(k)   { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

/* ── FETCH ───────────────────────────────────────────────────────── */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url     = new URL(request.url);

  if (request.method !== 'GET') return;

  /* Google Fonts → font cache */
  if (FONT_ORIGINS.some(function(o) { return request.url.startsWith(o); })) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* Same-origin + FontAwesome CDN → shell cache */
  if (url.origin === self.location.origin ||
      request.url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

/* ── Cache-First strategy ────────────────────────────────────────── */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (!response || response.status !== 200) return response;
      var clone = response.clone();
      caches.open(cacheName).then(function(c) { c.put(request, clone); });
      return response;
    }).catch(function() {
      if (request.mode === 'navigate') {
        return caches.match('/Quran-kareem/index.html');
      }
      return new Response('Offline', { status: 503 });
    });
  });
}
