/* DailyHub service worker — offline + actualizaciones inmediatas */
const CACHE = 'dailyhub-v10';
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
