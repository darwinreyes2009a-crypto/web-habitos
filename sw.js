/* DailyHub service worker — offline + actualizaciones inmediatas */
const CACHE = 'dailyhub-v16';
const ASSETS = ['./index.html', './manifest.webmanifest', './icon.svg', './vendor/supabase.js', './app-sync.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;

  // Navegación (el HTML de la app): red primero → si no hay conexión, caché.
  // Así los usuarios reciben las actualizaciones en cuanto hay internet.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Resto de recursos del propio origen: caché primero con actualización en segundo plano.
  if (sameOrigin) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(e.request, { ignoreSearch: true });
        const network = fetch(e.request)
          .then((res) => { if (res && res.ok) c.put(e.request, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Recursos de terceros (fuentes): red normal, con caché si falla.
  else {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(e.request);
        const network = fetch(e.request)
          .then((res) => { if (res && res.ok) c.put(e.request, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/* ============ NOTIFICACIONES PUSH ============ */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'DailyHub';
  const opts = {
    body: data.body || '',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'dailyhub',
    data: { url: data.url || './index.html' },
    renotify: true
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.includes('index.html')) { return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    self.registration.pushManager.getSubscription().then((sub) =>
      self.clients.matchAll({ includeUncontrolled: true }).then((list) => {
        for (const c of list) c.postMessage({ type: 'push-sub-changed', subscription: sub ? sub.toJSON() : null });
      })
    )
 );
});
