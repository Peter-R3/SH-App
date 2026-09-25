const CACHE_NAME = 'sweethearts-app-v57';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=55',
  './app.js?v=55',
  './diagnostics.js?v=57',
  './diagnostics.css?v=56',
  './store.js?v=55',
  './store.css?v=55',
  './achievements.js?v=54',
  './achievements.css?v=48',
  './game-history.js?v=54',
  './game-history.css?v=43',
  './assets/currency/Coin.svg?v=45',
  ...['Bronze','Silver','Gold','Osmium','Pink'].flatMap(tier => ['I','II','III','IV','V','Star'].map(rank => `./assets/achievements/${tier}_${rank}.svg`)),
  './realm-hub.js?v=47',
  './realm-planner.js?v=47',
  './realm-planner.css?v=55',
  './assets/icons/copy.svg',
  './realm-hub.css',
  './game-pause.js?v=43',
  './game-pause.css?v=43',
  './wordsearch.js',
  './battleship.js',
  './connect-four.js',
  './sudoku.js',
  './tic-tac-toe.js',
  './rps.js',
  './vendor/firebase/firebase-app-compat.js',
  './vendor/firebase/firebase-auth-compat.js',
  './vendor/firebase/firebase-database-compat.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './assets/games/one-to-ten.svg?v=45',
  './assets/games/word-search.svg?v=45',
  './assets/games/battleship.svg?v=49',
  './assets/games/connect-four.svg?v=45',
  './assets/games/sudoku.svg?v=45',
  './assets/games/tic-tac-toe.svg?v=45',
  './assets/games/rps.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const cacheable = url.origin === self.location.origin;
  if (!cacheable) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)
        .then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
