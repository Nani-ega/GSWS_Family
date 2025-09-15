const CACHE_NAME = "gsws-family-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/leaflet.css",
  "/assets/leaflet.js",
  "/assets/supabase.min.js",
  "/offline.html"
];

// Install event
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  // Handle navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        // Update cache with latest page
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // If offline, fallback to cached page or offline.html
        return caches.match(event.request).then(cachedResponse => {
          return cachedResponse || caches.match('./offline.html');
        });
      })
    );
    return;
  }

  // For other requests (images, CSS, etc)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request).then(networkResponse => {
        // Cache dynamically
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // Could add fallback for images here if desired
      });
    })
  );
});

