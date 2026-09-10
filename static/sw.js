// Cetas — © Marexsoft Corporation. Fondateur Kouassi Marius.
const CACHE_NAME = 'cetas-cache-v8';
const OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './js/data/models.js',
  './css/style.css',
  './images/cetas2.svg',
  './images/icon-192.png',
  './images/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.');
  const isMarexcode = url.pathname.includes('/marexcode/');
  const isAppCode = url.pathname.includes('/css/') || url.pathname.includes('/js/');
  if (isHTML || isMarexcode || isAppCode) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(event.request) || new Response(
        JSON.stringify({ error: 'Service indisponible' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || new Response(
          JSON.stringify({ error: 'Service indisponible' }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          }
        ));
      return cached || networkFetch;
    })
  );
});
