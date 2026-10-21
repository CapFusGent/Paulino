// Retired service worker.
// The first version of Paulino was an installable PWA with a caching service
// worker. This version doesn't use one. Browsers that still have the old worker
// fetch this file on their next visit; it clears the old caches and removes
// itself so the current index.html always loads from the host.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
