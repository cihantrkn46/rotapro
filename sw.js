const CACHE_NAME = 'rotapro-v10-optimized';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.url.includes('openstreetmap') || e.request.url.includes('osrm')) {
        e.respondWith(fetch(e.request));
        return;
    }

    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});