const BUILD_TIME = '__BUILD_TIME__';
const CACHE_NAME = 'lifhur-' + BUILD_TIME;
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  // No llamar skipWaiting aqui: el nuevo SW espera hasta que el usuario confirme
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// El cliente envia SKIP_WAITING cuando el usuario acepta actualizar
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  // No cachear requests de Firebase
  if (e.request.url.includes('firestore.googleapis.com') ||
      e.request.url.includes('firebase')) return;

  // index.html siempre desde red para detectar nuevos bundles
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
