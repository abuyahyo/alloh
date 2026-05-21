/*
 * Lightweight service worker for the He Is Allah PWA.
 *
 * Goal: ship updates instantly. iOS Safari and a few other browsers cache
 * static HTML aggressively (sometimes for many minutes), and a plain
 * cache-busting query on script/style tags can't help if the HTML *itself*
 * is stale. With this worker installed, the next visit always tries the
 * network first for navigations and falls back to the last-good cache
 * only when the user is offline. Other assets (JS, CSS, images, audio)
 * stay cache-first for speed.
 *
 * Bump CACHE on every deploy so old caches are evicted on activate.
 */

const CACHE = 'alloh-v2026052001';

self.addEventListener('install', (event) => {
  // A new worker should take over the page on the next navigation rather
  // than wait for every tab to close — the user just installed it because
  // they wanted the fresh content.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigations (HTML documents): network-first so deploys are picked up
  // immediately. The cached copy is only used when the network is
  // unreachable, which keeps the app usable offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (JS / CSS / images / audio) is content-addressable via
  // the ?v= query bump, so cache-first is safe and fast.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
