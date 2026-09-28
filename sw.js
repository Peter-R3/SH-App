const CACHE_NAME = 'sweethearts-app-v70';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=66',
  './app.js?v=69',
  './jigsaw.js?v=70',
  './jigsaw-model.js?v=69',
  './jigsaw.css?v=70',
  './assets/games/jigsaw.svg',
  ...['Me_and_SH','SH_and_Her_Cats','SH_and_The_Heart','SH_and_The_Panda','SH_and_The_Slime','SH_Cats_and_The_Spider','SH_Caving','SH_Caving_2','SH_Eating','SH_Farming_Trees','SH_in_a_Bookshelf','SH_in_Her_World','SH_in_Our_House','SH_Looking_at_the_Ravine','The_Big_Bunny'].map(name => `./assets/jigsaw/${name}.png`),
  './diagnostics.js?v=69',
  './diagnostics.css?v=56',
  './store.js?v=61',
  './store.css?v=60',
  './achievements.js?v=69',
  './achievements.css?v=48',
  './game-history.js?v=69',
  './game-history.css?v=43',
  './assets/currency/Coin.svg?v=45',
  ...['Bronze','Silver','Gold','Osmium','Pink'].flatMap(tier => ['I','II','III','IV','V','Star'].map(rank => `./assets/achievements/${tier}_${rank}.svg`)),
  './realm-hub.js?v=47',
  './realm-planner.js?v=47',
  './realm-planner.css?v=55',
  './assets/icons/copy.svg',
  './realm-hub.css',
  './game-pause.js?v=68',
  './focus-mode.js?v=68',
  './focus-mode.css?v=68',
  './game-pause.css?v=43',
  './minecraft-words.js?v=67',
  './wordsearch.js?v=67',
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
  './assets/games/rps.svg'
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
