'use strict';

const CACHE_NAME = 'chess-v4';

// Static assets to pre-cache on install
const PRECACHE = [
  '/',
  '/style.css',
  '/chess-engine.js',
  '/client.js',
  '/manifest.json',
  // Self-hosted fonts (offline-capable)
  '/vendor/fonts.css',
  '/vendor/fonts/crimson-pro-regular.woff2',
  '/vendor/fonts/crimson-pro-italic.woff2',
  '/vendor/fonts/playfair-display-700.woff2',
  '/vendor/fonts/playfair-display-italic.woff2',
  // Self-hosted Font Awesome
  '/vendor/fa/all.min.css',
  '/vendor/fa/webfonts/fa-solid-900.woff2',
  '/vendor/fa/webfonts/fa-regular-400.woff2',
  '/vendor/fa/webfonts/fa-brands-400.woff2',
  // Socket.io client — pre-cached so online play works offline after first visit
  '/vendor/socket.io.min.js',
  // App icons
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Chess pieces
  '/pieces/Chess_plt45.svg',
  '/pieces/Chess_pdt45.svg',
  '/pieces/Chess_rlt45.svg',
  '/pieces/Chess_rdt45.svg',
  '/pieces/Chess_nlt45.svg',
  '/pieces/Chess_ndt45.svg',
  '/pieces/Chess_blt45.svg',
  '/pieces/Chess_bdt45.svg',
  '/pieces/Chess_qlt45.svg',
  '/pieces/Chess_qdt45.svg',
  '/pieces/Chess_klt45.svg',
  '/pieces/Chess_kdt45.svg',
];

// Install: pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go to network for API and socket.io requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return; // let browser handle normally
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Cache successful GET responses
        if (request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
