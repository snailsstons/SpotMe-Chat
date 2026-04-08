/* ══════════════════════════════════════════════════
   SpotMe · Service Worker (für index.html)
   Strategie: Network First mit Offline-Fallback
   → App startet auch ohne Netz (aus Cache)
   → Neue Version wird sofort aktiv
══════════════════════════════════════════════════ */

const CACHE  = 'spotme-v28';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './pwa_180.png',
  './pwa_512.png'
];

/* ── Install: Kern-Assets cachen ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: Alten Cache aufräumen ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: Network First, Cache als Fallback ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname !== self.location.hostname) return; // externe URLs: direkt durch

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached => cached || caches.match('./index.html'))
      )
  );
});
