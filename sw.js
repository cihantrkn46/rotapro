const CACHE_NAME = 'rotapro-v13-cache';
const ASSETS = ['./','./index.html','./app.js','./style.css','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
const SKIP = ['tile.openstreetmap.org','overpass-api.de','open-meteo.com','nominatim.openstreetmap.org'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE_NAME).map(x => caches.delete(x)))));
  self.clients.claim();
});
// Ağ öncelikli, çevrimdışıysa önbellek
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || SKIP.some(s => r.url.includes(s))) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.status === 200) { const cp = res.clone(); caches.open(CACHE_NAME).then(c => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r).then(c => c || caches.match('./index.html')))
  );
});
