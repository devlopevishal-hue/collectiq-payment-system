// CollectIQ Progressive Web App Service Worker
const VERSION = '6.35.0';
const CACHE_NAME = 'collectiq-v' + VERSION;
const APP_FILES = [
  'styles.css', 'mobile-app.css',
  'activity-log.js', 'party-check.js', 'list-filters.js', 'save-guard.js', 'db-config.js',
  'supabase-store.js', 'auth.js', 'party-sync.js', 'followup-actions.js', 'ticket-actions.js',
  'payment-upload.js', 'payment-reverse.js', 'app.js', 'ai-tools.js', 'ai-chat.js', 'mobile-app.js'
];
const CORE_ASSETS = [
  './',
  './index.html',
  ...APP_FILES.map(f => './' + f + '?v=' + VERSION),
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// The page itself waits this long for the network before the saved copy is used,
// so a weak mobile signal does not leave a blank screen.
const PAGE_TIMEOUT_MS = 3500;

// Install: Cache core app shell for instant startup
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // One by one, so one failed file does not leave the whole cache empty.
      return Promise.all(CORE_ASSETS.map(a => cache.add(a).catch(err => {
        console.warn('[SW] Could not pre-cache', a, err);
      })));
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

function putInCache(req, res) {
  if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
  }
  return res;
}

// Files whose address names their version (app.js?v=6.35.0, supabase-js@2.45.4,
// fonts) never change, so the saved copy is used straight away: opening the app
// does not wait for ~20 downloads over the phone network.
function isVersioned(url) {
  if (url.origin === location.origin) return url.searchParams.has('v') || url.pathname.includes('/icons/');
  return url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com';
}

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => putInCache(req, res)));
}

// The page: newest from the network (so updates arrive), the saved copy if the
// network is slow or down.
function pageNetworkFirst(req) {
  const network = fetch(req).then(res => putInCache(req, res));
  const timeout = new Promise(resolve => setTimeout(resolve, PAGE_TIMEOUT_MS));
  const cached = () => caches.match(req).then(hit => hit || caches.match('./index.html'));
  return Promise.race([network, timeout.then(() => cached())])
    .then(res => res || network)
    .catch(() => cached());
}

// Everything else from this site: the saved copy now, refreshed in the background.
function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const network = fetch(req).then(res => putInCache(req, res)).catch(() => hit);
    return hit || network;
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip Firebase Firestore / Supabase APIs and dynamic database calls
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebase') || url.hostname.endsWith('.supabase.co') || url.pathname.includes('/api/')) {
    return;
  }

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(pageNetworkFirst(req));
  } else if (isVersioned(url)) {
    event.respondWith(cacheFirst(req));
  } else if (url.origin === location.origin || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(req));
  }
});
