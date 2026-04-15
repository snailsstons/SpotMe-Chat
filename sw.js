/* ═══════════════════════════════════════════════════════════════════════════
   SpotMe · Service Worker mit Periodic Background Sync
   – Holt regelmäßig Offline‑Nachrichten vom Server
   – Zeigt lokale Benachrichtigungen bei neuen Nachrichten
   – Alle Einstellungen werden aus localStorage gelesen (via Client‑Message)
═══════════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'spotme-v29';
const ASSETS = ['./', './index.html', './manifest.json', './pwa_180.png', './pwa_512.png'];
const API_BASE = 'https://spotme-pg-test.onrender.com/api';

let syncSettings = {
  enabled: true,
  interval: 'hourly'
};

// ─────────────────────────────────────────────────────────────────────────────
// Installation & Aktivierung
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Nachrichten vom Haupt‑Thread empfangen (Einstellungen & Token)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SET_SYNC_SETTINGS') {
    syncSettings = event.data.settings;
    registerPeriodicSync();
  }
  if (event.data && event.data.type === 'SET_TOKEN') {
    self.spotmeToken = event.data.token;
    self.spotmeCode = event.data.code;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Periodic Sync registrieren
async function registerPeriodicSync() {
  if (!syncSettings.enabled || syncSettings.interval === 'never') return;
  
  const registration = self.registration;
  if (!('periodicSync' in registration)) return;

  try {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return;

    const minInterval = syncSettings.interval === 'hourly' 
      ? 60 * 60 * 1000
      : 12 * 60 * 60 * 1000;

    await registration.periodicSync.register('spotme-sync', { minInterval });
    console.log(`✅ Periodic Sync registriert (Intervall: ${syncSettings.interval})`);
  } catch (e) {
    console.warn('Periodic Sync Registrierung fehlgeschlagen:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodic Sync Event – hier werden die Nachrichten abgeholt
self.addEventListener('periodicsync', event => {
  if (event.tag === 'spotme-sync') {
    event.waitUntil(checkForNewMessages());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Nachrichten vom Server abrufen und bei neuen Benachrichtigung zeigen
async function checkForNewMessages() {
  const token = self.spotmeToken;
  const code = self.spotmeCode;
  if (!token || !code) return;

  try {
    const res = await fetch(`${API_BASE}/offline-messages/${code}?token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const messages = await res.json();
    const unread = messages.filter(m => !m.read);
    if (unread.length === 0) return;

    const lastNotifiedId = await getLastNotifiedId();
    const newMessages = unread.filter(m => m.id > lastNotifiedId);
    if (newMessages.length === 0) return;

    const title = `SpotMe · ${newMessages.length} neue Nachricht${newMessages.length > 1 ? 'en' : ''}`;
    const options = {
      body: `Von ${newMessages.map(m => m.senderName).join(', ')}`,
      icon: './pwa_180.png',
      badge: './pwa_72.png',
      tag: 'spotme-sync',
      renotify: true,
      data: { url: './index.html' }
    };
    await self.registration.showNotification(title, options);

    const maxId = Math.max(...newMessages.map(m => m.id));
    await setLastNotifiedId(maxId);
  } catch (e) {
    console.error('Fehler beim Sync:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB für letzten Stand
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('SpotMeSW', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getLastNotifiedId() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const store = tx.objectStore('state');
    const req = store.get('lastNotifiedId');
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function setLastNotifiedId(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    const req = store.put(id, 'lastNotifiedId');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch-Handler (Network First)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname !== self.location.hostname) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});
