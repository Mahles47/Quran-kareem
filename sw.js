/**
 * ================================================================
 *  مصحف التدبر والالتزام — Service Worker v2.0
 *  Deployment: https://mahles47.github.io/Quran-kareem/
 * ================================================================
 *
 *  STRATEGY: Cache-First for everything.
 *
 *  quran.json is listed in SHELL_ASSETS and gets pre-cached on
 *  install. Every subsequent fetch() call from the app gets it
 *  instantly from Cache Storage — zero network, zero delay.
 *
 *  Cache version: bump CACHE_VER whenever you update quran.json
 *  or any shell asset. The activate handler purges old caches.
 * ================================================================
 */

'use strict';

/* ── Cache identity ─────────────────────────────────────────────── */
const CACHE_VER   = 'v2';
const SHELL_CACHE = 'mushaf-shell-' + CACHE_VER;
const FONT_CACHE  = 'mushaf-fonts-v1';     /* fonts change rarely */

/* ── Shell assets — everything the app needs to run offline ─────── */
const SHELL_ASSETS = [
  '/Quran-kareem/',
  '/Quran-kareem/index.html',
  '/Quran-kareem/manifest.json',
  '/Quran-kareem/quran.json',            /* ← THE KEY: full Quran cached on install */
  '/Quran-kareem/icon-192.png',
  '/Quran-kareem/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-regular-400.woff2',
];

/* ── Font CDN origins (separate long-lived cache) ───────────────── */
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/* ================================================================
   INSTALL — pre-cache all shell assets including quran.json
   ================================================================ */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing ' + CACHE_VER + ' — caching shell + quran.json');

  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function(cache) {
        /*
         * Use Promise.allSettled so a single CDN hiccup doesn't
         * abort the whole install. quran.json + index.html will
         * always succeed (same origin).
         */
        return Promise.allSettled(
          SHELL_ASSETS.map(function(url) {
            return cache
              .add(new Request(url, { cache: 'reload' }))
              .catch(function(err) {
                console.warn('[SW] Could not pre-cache:', url, err.message);
              });
          })
        );
      })
      .then(function() {
        console.log('[SW] Pre-cache complete — activating immediately');
        return self.skipWaiting();   /* activate without waiting for old SW to die */
      })
  );
});

/* ================================================================
   ACTIVATE — delete stale caches from previous versions
   ================================================================ */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating ' + CACHE_VER + ' — purging old caches');

  var KEEP = [SHELL_CACHE, FONT_CACHE];

  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) { return !KEEP.includes(k); })
            .map(function(k) {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        );
      })
      .then(function() {
        /*
         * clients.claim() makes this SW take control of all open
         * tabs immediately — no refresh needed on first install.
         */
        return self.clients.claim();
      })
  );
});

/* ================================================================
   FETCH — Cache-First routing
   ================================================================ */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url     = new URL(request.url);

  /* Only handle GET */
  if (request.method !== 'GET') return;

  /* ① Google Fonts → long-lived font cache */
  if (FONT_ORIGINS.some(function(o) { return request.url.startsWith(o); })) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* ② Same-origin assets + FontAwesome CDN → shell cache
        This includes /Quran-kareem/quran.json ← served from cache instantly */
  if (
    url.origin === self.location.origin ||
    request.url.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* ③ Everything else → network pass-through */
});

/* ================================================================
   STRATEGY: Cache-First with network fallback
   1. Check cache → return immediately if found (fast path)
   2. Miss → fetch from network → store clone in cache → return
   3. Network error → return offline fallback for navigation
   ================================================================ */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {

    /* ── Cache HIT: return instantly ── */
    if (cached) {
      return cached;
    }

    /* ── Cache MISS: go to network ── */
    return fetch(request)
      .then(function(response) {
        /* Only cache valid, non-error, non-opaque responses */
        if (
          !response ||
          response.status !== 200 ||
          response.type === 'error'
        ) {
          return response;
        }

        /* Clone before consuming — streams can only be read once */
        var toStore = response.clone();
        caches.open(cacheName).then(function(cache) {
          cache.put(request, toStore);
        });

        return response;
      })
      .catch(function() {
        /* Offline + not cached → serve index.html for navigation */
        if (request.mode === 'navigate') {
          return caches.match('/Quran-kareem/index.html');
        }
        return new Response('Offline', {
          status:     503,
          statusText: 'Service Unavailable',
          headers:    { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      });
  });
}
