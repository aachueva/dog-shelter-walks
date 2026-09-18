const shellCache = "dog-shelter-walks-shell-v2";
const shellFiles = ["/", "/styles.css?v=20260918-2", "/app.js?v=20260918-2"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(shellCache).then((cache) => cache.addAll(shellFiles)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== shellCache).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(request.mode === "navigate" ? "/" : request).then((cached) => {
      const update = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cacheKey = request.mode === "navigate" ? "/" : request;
            const cache = await caches.open(shellCache);
            await cache.put(cacheKey, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      return update;
    }),
  );
});
