const CACHE_NAME = "gsws-cache-v1.1";
const OFFLINE_URL = "/offline.html";

// Assets to pre-cache
const precacheAssets = [OFFLINE_URL];

// URLs that must always go to network
const neverCachePatterns = [
  "/index.html", "/", "supabase.co", "supabase.io",
  "env.js", "/api/", "/rest/", "/auth/", "/realtime/", "?",
  ".html"
];

function shouldNeverCache(url) {
  return neverCachePatterns.some(pattern => url.includes(pattern));
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(precacheAssets)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = event.request.url;

  if (shouldNeverCache(url)) {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-store" }))
        .catch(() => event.request.mode === "navigate" && caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        return resp;
      }).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key))).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});
