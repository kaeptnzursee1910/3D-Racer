// Service Worker: Netzwerk zuerst, bei fehlender Verbindung aus dem Cache (Offline-Spielen)
const CACHE = 'velox-v1';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './vendor/three.module.min.js',
  './js/main.js', './js/world.js', './js/track.js', './js/tracks.js', './js/environment.js', './js/textures.js',
  './js/car.js', './js/carModel.js', './js/ai.js', './js/camera.js', './js/effects.js', './js/audio.js',
  './js/input.js', './js/hud.js', './js/storage.js', './js/showroom.js', './js/utils.js',
  './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
