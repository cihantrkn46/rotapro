// RotaPro Service Worker — v11.0
// · KRİTİK: Network-first strateji (eski cache sorununu çözer)
// · Install'da eski cache'leri hemen sil
// · Offline durumda cache'e fallback

const VERSION   = 'rotapro-v11.0';
const RUNTIME   = 'rp-runtime-' + VERSION;
const CORE = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'
];
const TILE_HOSTS = ['tile.openstreetmap.de'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const TILE_MAX_AGE = 7 * 24 * 3600 * 1000;
const TILE_MAX_ENTRIES = 800;

/* ─── INSTALL: yeni SW hemen devreye gir + eski cache'leri sil ─── */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      /* 1. Tüm eski cache'leri sil (v11.0 hariç) */
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(k => k !== VERSION && k !== RUNTIME)
        .map(k => caches.delete(k).catch(() => {})));

      /* 2. CORE dosyalarını cache'le (tek tek, hata toleranslı) */
      const c = await caches.open(VERSION);
      for (const u of CORE) {
        try { await c.add(u); } catch (_) { /* dosya yoksa atla */ }
      }
    } catch (_) {}

    self.skipWaiting();
  })());
});

/* ─── ACTIVATE: hemen kontrolü ele al ─── */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      /* Runtime cache boyut kontrolü */
      const rc = await caches.open(RUNTIME);
      const reqs = await rc.keys();
      let n = reqs.length;
      for (const r of reqs) {
        try {
          const res = await rc.match(r);
          const ts = res && parseInt(res.headers.get('x-sw-ts') || '0', 10);
          if ((ts && Date.now() - ts > TILE_MAX_AGE) || n > TILE_MAX_ENTRIES) {
            await rc.delete(r); n--;
          }
        } catch (_) {}
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

/* ─── TILE: cache-first (offline dostu) ─── */
async function tileCacheFirst(req) {
  try {
    const c = await caches.open(RUNTIME);
    const hit = await c.match(req);
    if (hit) {
      const ts = parseInt(hit.headers.get('x-sw-ts') || '0', 10);
      if (ts && Date.now() - ts < TILE_MAX_AGE) return hit;
    }
    const res = await fetch(req);
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
      try { await c.put(req, stamp(res.clone())); } catch (_) {}
    }
    return res;
  } catch (e) {
    try {
      const c = await caches.open(RUNTIME);
      const hit = await c.match(req);
      if (hit) return hit;
    } catch (_) {}
    return Response.error();
  }
}

/* ─── UYGULAMA KABUĞU: network-first (KRİTİK!) ───
   Bu, eski app.js'in takılı kalmasını önler. */
async function appShellNetworkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      try {
        const c = await caches.open(VERSION);
        await c.put(req, res.clone());
      } catch (_) {}
    }
    return res;
  } catch (e) {
    try {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    } catch (_) {}
    return Response.error();
  }
}

/* ─── FONT: stale-while-revalidate ─── */
async function fontSWR(req) {
  const c = await caches.open(RUNTIME);
  const hit = await c.match(req);
  const p = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) {
      c.put(req, stamp(res.clone())).catch(() => {});
    }
    return res;
  }).catch(() => hit);
  return hit || p;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let u;
  try { u = new URL(req.url); } catch (_) { return; }
  const host = u.hostname;

  /* Navigasyon (index.html) → network-first */
  if (req.mode === 'navigate') {
    e.respondWith(appShellNetworkFirst(req));
    return;
  }

  /* OSM tile → cache-first */
  if (TILE_HOSTS.some(h => host.endsWith(h))) {
    e.respondWith(tileCacheFirst(req));
    return;
  }

  /* Fontlar → SWR */
  if (FONT_HOSTS.some(h => host === h)) {
    e.respondWith(fontSWR(req));
    return;
  }

  /* API uçları → her zaman ağ */
  if (['overpass-api.de','overpass.kumi.systems','overpass.private.coffee',
       'api.open-meteo.com','nominatim.openstreetmap.org',
       'router.project-osrm.org','routing.openstreetmap.de'].some(h => host === h)) {
    return;
  }

  /* Kendi dosyalarımız → network-first (cache fallback) */
  if (u.origin === self.location.origin &&
      /\.(js|css|png|json|html|svg|ico|webp)$/.test(u.pathname)) {
    e.respondWith(appShellNetworkFirst(req));
  }
});