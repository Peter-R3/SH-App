const CACHE_NAME = 'sh-app-v1';
const ASSETS = [
  '/sh-app/',
  '/sh-app/index.html',
  '/sh-app/styles.css',
  '/sh-app/app.js',
  '/sh-app/manifest.json'
];

// Install the service worker and cache core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Serve cached content when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
