// background.js - MV3 service worker (kept small)
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  clients.claim();
});
