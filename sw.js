// RotaPro Service Worker — v10.6
// Tile cache: OpenStreetMap (API anahtarsız)

const OLD_CACHES = [
  'rotapro-v1','rotapro-v2','rotapro-v3','rotapro-v4','rotapro-v5',
  'rotapro-v6','rotapro-v7','rotapro-v8','rotapro-v9',
  'rotapro-tiles-v1','rotapro-tiles-v2','rotapro-tiles-v3'
];
const TILE_CACHE = 'rotapro-tiles-v4';
const TILE_MAX = 600;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => (OLD_CACHES.includes(k) || k.startsWith('rotapro-')) && k !== TILE_CACHE)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (!url.hostname.endsWith('tile.openstreetmap.org')) return;
  e.respondWith(handleTile(req));
});

let _tileCounter = 0;

async function handleTile(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone());
      if (++_tileCounter % 40 === 0) trimCache(TILE_CACHE, TILE_MAX);
    }
    return res;
  } catch (_) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function trimCache(name, max) {
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (keys.length <= max) return;
    const drop = keys.length - max;
    for (let i = 0; i < drop; i++) await cache.delete(keys[i]);
  } catch (_) {}
}