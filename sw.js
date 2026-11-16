/* DailyHub service worker — offline + actualizaciones inmediatas */
const CACHE = 'dailyhub-v84';
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
  './styles/motion.css',
  './src/app.js',
  './src/core/context.js',
  './src/core/dom.js',
  './src/core/dates.js',
  './src/core/constants.js',
  './src/core/icons.js',
  './src/core/security.js',
  './src/core/interactions.js',
  './src/state/store.js',
  './src/core/routines.js',
  './src/core/dayplan.js',
  './src/navigation/router.js',
  './src/components/overlays.js',
  './src/components/profile-editor.js',
  './src/actions/records.js',
  './src/services/media.js',
  './src/services/notifications.js',
  './src/features/auth.js',
  './src/features/onboarding-shell.js',
  './src/features/home-tasks.js',
  './src/features/task-row.js',
  './src/features/search.js',
  './src/features/now.js',
  './src/features/platform.js',
  './src/features/gifts-people.js',
  './src/features/forms.js',
  './src/features/settings.js',
  './src/features/class/agenda.js',
  './src/features/class/notes.js',
  './src/features/class/schedule.js',
  './src/features/class/calendar-core.js',
  './src/features/class/schedule-extra.js',
  './src/features/class/schedule-grid.js',
  './src/features/class/schedule-import.js'
];

self.addEventListener('install', (event) => {
  // SIN skipWaiting aquí a propósito. El service worker nuevo precachea y se
  // queda en `waiting`; la app muestra el aviso "Hay una versión nueva" y solo
  // se activa cuando el usuario pulsa "Actualizar" (mensaje `skip-waiting`).
  //
  // Un `catch(() => {})` aquí dejaba instalar una versión con ficheros
  // ausentes: caché incompleta y modo offline roto sin aviso. Ahora el fallo se
  // registra, se elimina la caché a medias y la instalación RECHAZA, de modo que
  // la versión anterior sigue siendo la que controla (P2.17).
  //
  // Cada fichero se baja con `cache: 'no-cache'`: `cache.addAll` usa la caché
  // HTTP del navegador, y la caché heurística (Last-Modified) pudo responder
  // con bytes viejos, instalando una versión nueva con módulos de la anterior
  // (la fila "Cambiar de perfil" no llegaba a la caché precacheada).
  event.waitUntil(caches.open(CACHE).then(async cache => {
    try {
      const responses = await Promise.all(ASSETS.map(url => fetch(url, { cache: 'no-cache' }).then(response => {
        if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'sin respuesta') + ' al precachear ' + url);
        return response;
      })));
      await Promise.all(ASSETS.map((url, index) => cache.put(url, responses[index])));
    } catch (error) {
      console.error('DailyHub: no se pudo precachear ' + CACHE + '; se descarta la instalación', error);
      await caches.delete(CACHE);
      if (self.clients && self.clients.matchAll) {
        try {
          const list = await self.clients.matchAll({ type: 'window' });
          for (const client of list) {
            client.postMessage({ type: 'sw-install-failed', cache: CACHE, error: String((error && error.message) || error) });
          }
        } catch (ignore) {}
      }
      throw error;
    }
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// La app avisa de que hay versión nueva y el usuario pulsa "Actualizar": es
// entonces cuando se activa, para no dejar una pestaña a medio cargar.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
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
        // `no-cache` también aquí: la revalidación de fondo sin él podía
        // responder desde la caché HTTP del navegador y pisar la entrada
        // fresca del precache con bytes de una versión anterior.
        const network = fetch(event.request, { cache: 'no-cache' })
          .then(response => { if (response && response.ok) cache.put(event.request, response.clone()); return response; })
          .catch(() => cached);
        return cached || network;
      })
    );
  } else {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request, { cache: 'no-cache' })
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
