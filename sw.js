/* DailyHub service worker — offline + actualizaciones inmediatas */
const CACHE = 'dailyhub-v22';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './vendor/supabase.js',
  './app-sync.js',
  './styles/tokens.css',
  './styles/components.css',
  './styles/features.css',
  './src/app.js',
  './src/core/context.js',
  './src/core/dom.js',
  './src/core/dates.js',
  './src/core/constants.js',
  './src/core/icons.js',
  './src/core/security.js',
  './src/core/interactions.js',
  './src/state/store.js',
  './src/navigation/router.js',
  './src/components/overlays.js',
  './src/actions/records.js',
  './src/services/media.js',
  './src/services/notifications.js',
  './src/features/auth.js',
  './src/features/onboarding-shell.js',
  './src/features/home-tasks.js',
  './src/features/gifts-people.js',
  './src/features/forms.js',
  './src/features/settings.js',
  './src/features/class/agenda.js',
  './src/features/class/notes.js',
  './src/features/class/schedule.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === location.origin;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) caches.open(CACHE).then(cache => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('./index.html').then(response => response || Response.error()))
    );
    return;
  }

  if (sameOrigin) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(event.request, { ignoreSearch: true });
        const network = fetch(event.request)
          .then(response => { if (response && response.ok) cache.put(event.request, response.clone()); return response; })
          .catch(() => cached);
        return cached || network;
      })
    );
  } else {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then(response => { if (response && response.ok) cache.put(event.request, response.clone()); return response; })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/* ============ NOTIFICACIONES PUSH ============ */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'DailyHub';
  const options = {
    body: data.body || '',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'dailyhub',
    data: { url: data.url || './index.html' },
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if (client.url.includes('index.html')) return client.focus();
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.getSubscription().then(subscription =>
      self.clients.matchAll({ includeUncontrolled: true }).then(list => {
        for (const client of list) client.postMessage({ type: 'push-sub-changed', subscription: subscription ? subscription.toJSON() : null });
      })
    )
  );
});
