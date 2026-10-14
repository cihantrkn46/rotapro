const CACHE_NAME = 'rotapro-v11-cache';
const ASSETS = [
  './index_2.html',
  './app.js',
  './style.css',
  './manifest.json'
];

// Yükleme aşaması: Önemli dosyaları önbelleğe al
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Etkinleştirme aşaması: Eski önbellekleri temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// İstek yönetimi: Önce önbellek, sonra ağ stratejisi
self.addEventListener('fetch', event => {
  // Harita tile'ları veya harici API istekleri için önbelleğe takılma
  if (event.request.url.includes('tile.openstreetmap.org') || 
      event.request.url.includes('overpass-api.de') || 
      event.request.url.includes('open-meteo.com') ||
      event.request.url.includes('nominatim.openstreetmap.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          // Geçerli yanıtları önbelleğe kaydet
          if (event.request.method === 'GET' && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      }).catch(() => {
        // Çevrimdışı durumlar için yedek davranış
      });
    })
  );
});