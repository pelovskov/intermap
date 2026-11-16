/* Service worker: gemmer appen til offline brug + kortfliser man har set. */
const VERSION = 'v3';
const APP_CACHE = 'intermap-app-' + VERSION;
const TILE_CACHE = 'intermap-tiles';   // beholdes på tværs af versioner
const IMG_CACHE = 'intermap-img';      // punktbilleder (fyldes af appen), beholdes på tværs af versioner
const MAX_TILES = 3000;

const APP_FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'data/points.json',
  'manifest.webmanifest',
  'img/placeholder.svg',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/markercluster/leaflet.markercluster.js',
  'vendor/markercluster/MarkerCluster.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('intermap-app-') && k !== APP_CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Kortfliser: cache først, ellers net (og gem).
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(tileFirst(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Punktdata: prøv nettet først (uden om browserens HTTP-cache), så rettelser slår igennem; fald tilbage til cache.
  if (url.pathname.endsWith('/data/points.json')) {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' }).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(APP_CACHE).then((c) => c.put(req.url, copy));
        return res;
      }).catch(() => caches.match(req.url, { ignoreSearch: true }))
    );
    return;
  }

  // Alt andet fra appen: cache først. Billeder gemmes, når de vises første gang.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.includes('/img/')) {
        const copy = res.clone();
        caches.open(IMG_CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

async function tileFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      trimTiles(cache);
    }
    return res;
  } catch (err) {
    return Response.error();
  }
}

let trimming = false;
async function trimTiles(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}
