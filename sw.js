/**
 * ================================================================
 *  مصحف التدبر والالتزام — Service Worker  v1.0
 * ================================================================
 *  Cache Strategy
 *  ─────────────
 *  • Shell assets (HTML, FA CSS, FA woff2) → Cache-First
 *  • Google Fonts CSS + woff2              → Cache-First (long TTL)
 *  • Everything else                       → Network pass-through
 *
 *  The Quran JSON file is intentionally NOT cached here because
 *  it lives in JS memory after the user uploads it, and it is
 *  too large (~5 MB) to store reliably in the Cache API on all
 *  devices. LocalStorage persists the reading position instead.
 * ================================================================
 */

'use strict';

/* ── Cache identifiers ──────────────────────────────────────────── */
const SHELL_CACHE = 'mushaf-shell-v1';
const FONT_CACHE  = 'mushaf-fonts-v1';

/**
 * Shell assets — everything required to render the app UI
 * with zero network. Add any additional local assets here.
 */
const SHELL_ASSETS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-regular-400.woff2',
];

/* Origins whose responses are stored in the dedicated font cache */
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/* ── INSTALL: pre-cache shell assets ───────────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v1 — pre-caching shell assets');

  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => {
        console.log('[SW] Shell assets cached');
        return self.skipWaiting(); /* Activate immediately, no waiting */
      })
      .catch((err) => console.error('[SW] Pre-cache error:', err))
  );
});

/* ── ACTIVATE: purge stale caches from previous versions ────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating — purging stale caches');

  const VALID = [SHELL_CACHE, FONT_CACHE];

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !VALID.includes(k))
            .map((k) => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim()) /* Take control of all open tabs */
  );
});

/* ── FETCH: route requests through the right strategy ──────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Only handle GET; let POST/PUT etc. pass through untouched */
  if (request.method !== 'GET') return;

  /* Strategy A: Google Fonts → long-lived font cache */
  if (FONT_ORIGINS.some((o) => request.url.startsWith(o))) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* Strategy B: Same-origin files + FontAwesome CDN → shell cache */
  if (
    url.origin === self.location.origin ||
    request.url.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  /* Strategy C: Everything else — network only, no caching */
});

/* ── Cache-First with network fallback ──────────────────────────── */
async function cacheFirst(request, cacheName) {
  try {
    /* 1. Check cache */
    const cached = await caches.match(request);
    if (cached) return cached;

    /* 2. Cache miss — go to network */
    const response = await fetch(request);

    /* Only cache valid, non-opaque responses */
    if (response && response.status === 200 && response.type !== 'error') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()); /* background write */
    }

    return response;
  } catch (_err) {
    /* Offline fallback: serve index.html for navigation requests */
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
