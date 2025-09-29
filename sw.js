const CACHE_VERSION = "v" + Date.now();
const STATIC_CACHE = "gsws-static-" + CACHE_VERSION;
const DYNAMIC_CACHE = "gsws-dynamic-" + CACHE_VERSION;

// Only cache truly static assets
const staticAssets = [
  "/manifest.json",
  "/assets/icons/icon-192.png", 
  "/assets/icons/icon-512.png",
  "/assets/leaflet.css",
  "/assets/leaflet.js",
  "/assets/supabase.min.js",
  "/offline.html"
];

// URLs and patterns to NEVER cache
const neverCachePatterns = [
  "/index.html",
  "/",
  "supabase.co",
  "supabase.io",  // Added for Supabase URLs
  "env.js",       // Added to prevent caching config
  "cdn.jsdelivr.net", 
  "unpkg.com",
  "/api/",
  "/rest/",       // Supabase REST API
  "/auth/",       // Supabase Auth
  "/realtime/",   // Supabase Realtime
  "?",
  ".html"
];

// Install event - only cache static assets
self.addEventListener("install", event => {
  console.log("SW: Installing version", CACHE_VERSION);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log("SW: Caching static assets");
        return Promise.allSettled(
          staticAssets.map(asset => 
            cache.add(asset).catch(err => {
              console.warn("SW: Failed to cache", asset, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log("SW: Static assets cached");
        return self.skipWaiting();
      })
      .catch(error => {
        console.error("SW: Install failed", error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", event => {
  console.log("SW: Activating version", CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        const validCaches = [STATIC_CACHE, DYNAMIC_CACHE];
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!validCaches.includes(cacheName)) {
              console.log("SW: Deleting old cache", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Take control of all clients
      self.clients.claim()
    ]).then(() => {
      console.log("SW: Activated successfully");
    })
  );
});

// Fetch event with intelligent caching strategy
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const requestURL = event.request.url.toLowerCase();
  
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }
  
  // Never cache these patterns
  if (shouldNeverCache(requestURL)) {
    console.log("SW: Never cache", event.request.url);
    event.respondWith(
      fetch(event.request, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      }).catch(() => {
        // Only return offline page for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }
        throw new Error("Network failed");
      })
    );
    return;
  }
  
  // Handle navigation requests (HTML pages) - always fetch fresh
  if (event.request.mode === "navigate") {
    console.log("SW: Navigation request, fetching fresh");
    event.respondWith(
      fetch(event.request, {
        cache: "no-store"
      }).catch(() => {
        return caches.match("/offline.html") || 
               new Response("Offline", {status: 503});
      })
    );
    return;
  }
  
  // Handle static assets (cache first strategy)
  if (isStaticAsset(requestURL)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          console.log("SW: Serving from cache", event.request.url);
          return cachedResponse;
        }
        
        return fetch(event.request).then(networkResponse => {
          // Only cache successful responses
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
  
  // Handle other requests (network first, then cache)
  event.respondWith(
    fetch(event.request, {
      cache: "no-cache"
    }).then(response => {
      // Don't cache API responses or dynamic content
      return response;
    }).catch(() => {
      // Fallback to cache only for non-critical requests
      return caches.match(event.request);
    })
  );
});

// Helper function to determine if URL should never be cached
function shouldNeverCache(url) {
  return neverCachePatterns.some(pattern => {
    if (pattern.startsWith("/") && pattern.endsWith("/")) {
      return url === pattern || url === pattern.slice(0, -1);
    }
    return url.includes(pattern);
  });
}

// Helper function to determine if request is for static asset
function isStaticAsset(url) {
  const staticExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", 
    ".woff", ".woff2", ".ttf", ".eot", ".json"
  ];
  
  return staticExtensions.some(ext => url.endsWith(ext)) ||
         url.includes("/assets/icons/");
}

// Handle messages from main thread
self.addEventListener("message", event => {
  console.log("SW: Received message", event.data);
  
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
        console.log("SW: All caches cleared");
      })
    );
  }
  
  if (event.data && event.data.type === "GET_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_VERSION });
    }
  }
});

// Handle sync events for background sync
self.addEventListener("sync", event => {
  console.log("SW: Background sync triggered", event.tag);
  
  if (event.tag === "background-sync") {
    event.waitUntil(
      // Add any background sync logic here if needed
      Promise.resolve()
    );
  }
});

console.log("SW: Service Worker loaded, version", CACHE_VERSION);