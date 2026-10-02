// CollectIQ Progressive Web App Service Worker
const CACHE_NAME = 'collectiq-v6.9.4';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=6.9.4',
  './app.js?v=6.9.4',
  './latest-report-data.js?v=6.9.4',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: Cache core app shell for instant startup
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS).catch(err => {
        console.warn('[SW] Core assets pre-caching partial fail:', err);
      });
    })
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First with Cache Fallback for instant load & seamless updates
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip Firebase Firestore API and dynamic database calls
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebase') || url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        // Cache successful responses for our origin and key CDNs
        if (networkResponse && networkResponse.status === 200 && (url.origin === location.origin || url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('fonts.gstatic.com'))) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline or slow network: Return from cache
        return caches.match(req).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
