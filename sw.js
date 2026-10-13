// RotaPro Service Worker — v6
// Amacı: eski cache'leri temizlemek + PWA install şartını karşılamak.
// Fetch handler YOK (boş handler Chrome uyarısı üretiyordu — kaldırıldı).

const OLD_CACHES = ['rotapro-v1', 'rotapro-v2', 'rotapro-v3', 'rotapro-v4', 'rotapro-v5'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => OLD_CACHES.includes(k) || k.startsWith('rotapro-'))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});