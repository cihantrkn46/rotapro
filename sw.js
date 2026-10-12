// RotaPro Service Worker — v11.0
// Minimal ve stabil. Sadece kendi dosyalarımızı cache'ler.

const VERSION = 'rotapro-v11';
const RUNTIME = 'rp-runtime-v11';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(VERSION);
      for (const u of CORE) {
        try { await c.add(u); } catch (_) {}
      }
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        if (k !== VERSION && k !== RUNTIME) {
          try { await caches.delete(k); } catch (_) {}
        }
      }
    } catch (_) {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let u;
  try { u = new URL(req.url); } catch (_) { return; }

  // OSM tile: cache-first
  if (u.hostname.endsWith('tile.openstreetmap.de')) {
    e.respondWith((async () => {
      try {
        const c = await caches.open(RUNTIME);
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) {
          try { await c.put(req, res.clone()); } catch (_) {}
        }
        return res;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // Kendi dosyalarımız: network-first, cache fallback
  if (u.origin === self.location.origin && /\.(js|css|html|json|png|svg|ico)$/.test(u.pathname)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          try {
            const c = await caches.open(VERSION);
            await c.put(req, res.clone());
          } catch (_) {}
        }
        return res;
      } catch (_) {
        try {
          const c = await caches.open(VERSION);
          const hit = await c.match(req);
          if (hit) return hit;
          if (req.mode === 'navigate') {
            const idx = await c.match('index.html');
            if (idx) return idx;
          }
        } catch (_) {}
        return Response.error();
      }
    })());
    return;
  }

  // Diğer her şey: doğrudan ağ (SW dokunmaz)
});