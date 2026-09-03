const CACHE_NAME = 'opg-evidencija-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
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
// Aplikacija šalje firebaseConfig ovamo nakon prijave (config nije tajna —
// vidljiv je i inače u samoj aplikaciji), tek tad se aktivira FCM.
let fcmReady = false;
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_FCM' && !fcmReady) {
    fcmReady = true;
    try {
      importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
      importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
      firebase.initializeApp(event.data.config);
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage((payload) => {
        const title = (payload.notification && payload.notification.title) || 'OPG Ojdanić';
        const body = (payload.notification && payload.notification.body) || '';
        self.registration.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
      });
    } catch (e) {
      console.error('FCM init greška u service workeru', e);
    }
  }
});
