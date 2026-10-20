/**
 * RotaPro — Service Worker v9 (Offline Cache, Smart Tile Cache, Nav Fallback)
 * MCT YAZILIM
 */
'use strict';

const CACHE_NAME = 'rotapro-v9-cache';
const TILE_CACHE = 'rotapro-tiles-v2';
const FONT_CACHE = 'rotapro-fonts-v1';
const MAX_TILES = 800;

const CORE = ['./', './index.html', './style.css', './app.js', './manifest.json'];
const OPTIONAL = [
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))); // zorunlu (HTTP önbelleğini atla): hata verirse kurulum iptal
    await Promise.allSettled(OPTIONAL.map(u => cache.add(u))); // opsiyonel: eksik olabilir
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  const keep = [CACHE_NAME, TILE_CACHE, FONT_CACHE];
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

const cacheable = r => r && (r.ok || r.type === 'opaque');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Canlı API'ler: SW karışmasın
  if (/overpass-api|router\.project-osrm\.org|open-meteo\.com|generativelanguage\.googleapis\.com/.test(url.host)) return;

  // Harita karoları: cache-first, boşsa şeffaf 204
  if (url.host.endsWith('tile.openstreetmap.org')) {
    e.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (cacheable(res)) {
          cache.put(req, res.clone());
          if (Math.random() < 0.05) trimCache(TILE_CACHE, MAX_TILES);
        }
        return res;
      } catch (_) {
        return new Response('', { status: 204 });
      }
    })());
    return;
  }

  // Google Fonts: cache-first
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (cacheable(res)) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return new Response('', { status: 204 });
      }
    })());
    return;
  }

  // Sayfa gezintisi: network-first, offline'da index.html
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put('./index.html', res.clone()));
        return res;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) ||
          new Response('Çevrimdışı', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Sadece same-origin + Leaflet (unpkg): stale-while-revalidate
  const isLeaflet = url.host === 'unpkg.com' && url.pathname.includes('/leaflet@');
  if (url.origin !== location.origin && !isLeaflet) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (cacheable(res)) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { network.catch(() => {}); return cached; }
    return (await network) || new Response('', { status: 504 });
  })());
});
