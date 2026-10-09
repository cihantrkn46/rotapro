// RotaPro Service Worker — v5 (Offline destek kaldırıldı)
// Amacı: eski cache'leri temizlemek + PWA install prompt şartını karşılamak.
// Hiçbir istek cache'lenmez.

const OLD_CACHES = ['rotapro-v1', 'rotapro-v2', 'rotapro-v3', 'rotapro-v4'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Eski sürümlerin cache'lerini temizle
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => OLD_CACHES.includes(k) || k.startsWith('rotapro-'))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Fetch handler boş — hiçbir şey cache'lenmez, network her zaman öncelikli.
self.addEventListener('fetch', () => {});