const CACHE_NAME = 'opg-evidencija-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/sprayer-tab.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: uvijek pokušaj dohvatiti najnoviju verziju kad ima interneta;
// keširana verzija koristi se samo kao rezerva kad nema signala (offline rad).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((networkResp) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResp.clone()));
        return networkResp;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---- Push obavijesti (Firebase Cloud Messaging) ----
// Izravno čitamo push payload bez oslanjanja na Firebase SDK unutar service
// workera — iOS Safari često "ugasi" service worker između obavijesti, pa
// pristup koji ovisi o tome da je stranica ikad poslala postavke (i time
// pokrenula firebase.messaging() u ovoj instanci workera) zna zakazati.
// Ovaj pristup radi bez obzira je li stranica ikad bila otvorena.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const notif = payload.notification || {};
  const title = notif.title || 'OPG Ojdanić';
  const body = notif.body || '';
  event.waitUntil(
    self.registration.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png' })
  );
});
