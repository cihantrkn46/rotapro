// RotaPro Service Worker — v4 (API anahtarsız, sağlamlaştırılmış)
const V = 'rotapro-v4';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'
];
const CDN = /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (!r.url.startsWith('http')) return;
  const same = new URL(r.url).origin === self.location.origin;
  if (!same && !CDN.test(r.url)) return;

  if (same) {
    e.respondWith(
      fetch(r).then(res => {
        if (res.ok) {
          const cp = res.clone();
          caches.open(V).then(c => c.put(r, cp));
        }
        return res;
      }).catch(() =>
        caches.match(r).then(m => m ||
          (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
    );
  } else {
    e.respondWith(
      caches.match(r).then(m => m || fetch(r).then(res => {
        if (res.ok || res.type === 'opaque') {
          const cp = res.clone();
          caches.open(V).then(c => c.put(r, cp));
        }
        return res;
      }))
    );
  }
});