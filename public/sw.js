// Aiya PWA Service Worker
const CACHE_NAME = 'aiya-pwa-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // keep the custom ringtone cache (aiya-ringtone-*)
          if (key !== CACHE_NAME && key.startsWith('aiya-pwa')) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache API calls or non-GET requests
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Navigation requests: try network first, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Static assets: Stale-While-Revalidate (fast load + background update)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            event.request.method === 'GET'
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// ----------------- Reminder notifications -----------------
// Two buttons: "Sudah Minum" records the drink without opening the app,
// "Tutup" closes the notification and stops the reminder sound in any open Aiya window.

const REMINDER_ACTIONS = [
  { action: 'drink', title: 'Sudah Minum' },
  { action: 'dismiss', title: 'Tutup' },
];

function windowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function broadcast(message) {
  for (const client of await windowClients()) client.postMessage(message);
}

async function focusOrOpen(url) {
  const list = await windowClients();
  for (const client of list) {
    if ('focus' in client) return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow(url);
}

async function recordDrinkFromNotification(data) {
  await broadcast({ type: 'aiya-stop-sound' });

  // From a server push: signed ticket -> record directly, no need to open the app
  if (data && data.drink) {
    try {
      const res = await fetch('/api/drink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.drink),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        await self.registration.showNotification('Minum tercatat', {
          body: `+${json.amountMl} ml. Jadwal minum berikutnya sudah diatur.`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'aiya-drink',
          silent: true,
          data: { url: '/#home' },
        });
        return;
      }
    } catch (e) {
      // offline etc. -> fall through to the app
    }
  }

  // Shown by the open app (or the server call failed): let one open window record it
  const list = await windowClients();
  if (list.length > 0) {
    list[0].postMessage({ type: 'aiya-drink' });
    return;
  }
  if (self.clients.openWindow) await self.clients.openWindow('/?aiya-action=drink#home');
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === 'dismiss') {
    event.waitUntil(broadcast({ type: 'aiya-stop-sound' }));
    return;
  }
  if (event.action === 'drink') {
    event.waitUntil(recordDrinkFromNotification(data));
    return;
  }
  // Clicked the notification itself: bring Aiya to the front
  event.waitUntil(Promise.all([broadcast({ type: 'aiya-stop-sound' }), focusOrOpen(data.url || '/#home')]));
});

// Swiping the notification away also stops the sound
self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  if (data.kind === 'reminder') event.waitUntil(broadcast({ type: 'aiya-stop-sound' }));
});

// Background reminder sent by the server (api/send-reminders.ts).
// Shown even when Aiya is closed, as long as the browser is running.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Aiya: Waktunya Minum!';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Yuk minum air dulu, lalu tekan "Sudah Minum".',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'aiya-drink',
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 150, 300],
      actions: REMINDER_ACTIONS,
      data: { kind: 'reminder', url: data.url || '/#home', drink: data.drink || null },
    })
  );
});
