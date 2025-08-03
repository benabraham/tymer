const CACHE_NAME = 'timer-app-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // If found in cache, return the cached version
        }
        return fetch(event.request).catch((error) => {
          console.error('Fetch error:', error);
          // You could return a custom offline page or a fallback response here
        });
      })
  );
});
