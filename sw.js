/**
 * ================================================================
 *  مصحف التدبر والالتزام — Service Worker  v1.1
 * ================================================================
 *  Strategy
 *  ────────
 *  • Shell assets (HTML, FA CSS, FA woff2) → Cache-First
 *  • Google Fonts CSS + woff2              → Cache-First (long TTL)
 *  • Everything else                       → Network pass-through
 *
 *  GitHub Pages note
 *  ──────────────────
 *  This SW is registered WITHOUT an explicit scope, so the browser
 *  derives the scope from the SW file location. This means it works
 *  correctly on BOTH:
 *    • https://user.github.io/repo-name/   (subpath deployment)
 *    • https://user.github.io/              (root / custom domain)
 *
 *  All SHELL_ASSETS use relative paths ('index.html', not '/repo/index.html')
 *  so caching resolves correctly regardless of deploy path.
 * ================================================================
 */

'use strict';

/* ── Cache identifiers ──────────────────────────────────────────── */
const SHELL_CACHE = 'mushaf-shell-v1';
const FONT_CACHE  = 'mushaf-fonts-v1';

/**
 * Shell assets: relative URLs only.
 * The SW intercepts requests whose URLs match the SW scope,
 * so 'index.html' resolves to the correct full URL automatically.
 */
const SHELL_ASSETS = [
  'index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-regular-400.woff2',
];

/* Origins whose responses go into the dedicated font cache */
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/* ── INSTALL: pre-cache shell assets ─────────────────────────── */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing v1.1 — caching shell assets');
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function(cache) {
        return Promise.allSettled(
          SHELL_ASSETS.map(function(url) {
            return cache.add(new Request(url, { cache: 'reload' })).catch(function(err) {
              /* Non-fatal: log and continue even if one CDN asset fails */
              console.warn('[SW] Could not pre-cache:', url, err);
            });
          })
        );
      })
      .then(function() {
        console.log('[SW] Pre-cache complete');
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE: purge old caches ─────────────────────────────── */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating — purging stale caches');
  var VALID = [SHELL_CACHE, FONT_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) { return !VALID.includes(k); })
            .map(function(k) {
              console.log('[SW] Deleting stale cache:', k);
              return caches.delete(k);
            })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

/* ── FETCH: route requests through the right strategy ─────────── */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url     = new URL(request.url);

  /* Only handle GET requests */
  if (request.method !== 'GET') return;

  /* Google Fonts → long-lived font cache */
  if (FONT_ORIGINS.some(function(o) { return request.url.startsWith(o); })) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* Same-origin files + FontAwesome CDN → shell cache */
  if (
    url.origin === self.location.origin ||
    request.url.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* Everything else → network only */
});

/* ── Strategy: Cache-First with network fallback ────────────── */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;

    return fetch(request)
      .then(function(response) {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        /* Store a clone; the original stream can only be consumed once */
        var toCache = response.clone();
        caches.open(cacheName).then(function(cache) {
          cache.put(request, toCache);
        });
        return response;
      })
      .catch(function() {
        /* Offline fallback: serve cached index.html for navigation */
        if (request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      });
  });
}
