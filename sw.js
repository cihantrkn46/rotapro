// RotaPro Service Worker — v10.2
// · Uygulama kabuğu ön-bellekleme (gerçek offline)
// · Harita karoları: cache-first + 7 gün süre sonu + sınır
// · Fontlar: stale-while-revalidate
// · Navigasyon: network-first, düşerse index.html

const VERSION   = 'rotapro-v10.0';
const RUNTIME   = 'rp-runtime-' + VERSION;
const CORE = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'
];
const TILE_HOSTS = ['basemaps.cartocdn.com', 'tile.openstreetmap.org'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const TILE_MAX_AGE = 7 * 24 * 3600 * 1000;
const TILE_MAX_ENTRIES = 800;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== VERSION && k !== RUNTIME && (k.startsWith('rotapro') || k.startsWith('rp-')))
      .map(k => caches.delete(k)));
    try {
      const rc = await caches.open(RUNTIME);
      const reqs = await rc.keys();
      let n = reqs.length;
      for (const r of reqs) {
        const res = await rc.match(r);
        const ts = res && parseInt(res.headers.get('x-sw-ts') || '0', 10);
        if ((ts && Date.now() - ts > TILE_MAX_AGE) || n > TILE_MAX_ENTRIES) {
          await rc.delete(r); n--;
        }
      }
    } catch (_) {}
    await self.clients.claim();
  })());
});

function stamp(res) {
  try {
    const h = new Headers(res.headers);
    h.set('x-sw-ts', String(Date.now()));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (_) { return res; }
}

async function tileCacheFirst(req) {
  const c = await caches.open(RUNTIME);
  const hit = await c.match(req);
  if (hit) {
    const ts = parseInt(hit.headers.get('x-sw-ts') || '0', 10);
    if (ts && Date.now() - ts < TILE_MAX_AGE) return hit;
  }
  try {
    const res = await fetch(req);
    /* ONARIM: operatör önceliği — parantezler eklendi */
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
      try { await c.put(req, stamp(res.clone())); } catch (_) {}
    }
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}

async function fontSWR(req) {
  const c = await caches.open(RUNTIME);
  const hit = await c.match(req);
  const p = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) {
      try { c.put(req, stamp(res.clone())); } catch (_) {}
    }
    return res;
  }).catch(() => hit);
  return hit || p;
}

async function navNetworkFirst(req) {
  try {
    return await fetch(req);
  } catch (e) {
    const c = await caches.open(VERSION);
    return (await c.match('index.html')) || (await c.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let u;
  try { u = new URL(req.url); } catch (_) { return; }
  const host = u.hostname;

  if (req.mode === 'navigate') { e.respondWith(navNetworkFirst(req)); return; }

  if (TILE_HOSTS.some(h => host.endsWith(h))) { e.respondWith(tileCacheFirst(req)); return; }

  if (FONT_HOSTS.some(h => host === h)) { e.respondWith(fontSWR(req)); return; }

  if (['overpass-api.de','overpass.kumi.systems','overpass.private.coffee',
       'api.open-meteo.com','nominatim.openstreetmap.org',
       'router.project-osrm.org','routing.openstreetmap.de'].some(h => host === h)) {
    return;
  }

  if (u.origin === self.location.origin && /\.(js|css|png|json|html)$/.test(u.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) { try { await c.put(req, res.clone()); } catch (_) {} }
        return res;
      } catch (e) { return hit || Response.error(); }
    })());
  }
});