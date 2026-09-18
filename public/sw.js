const shellCache = "dog-shelter-walks-shell-v5";
const shellFiles = [
  "/",
  "/styles.css?v=20260918-2",
  "/app.js?v=20260918-2",
  "/match.html",
  "/match.css?v=20260918-4",
  "/match.js?v=20260918-5",
  "/dog.html",
  "/dog.js?v=20260918-2",
  "/adoption-dogs.json",
];

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

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(shellCache);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => (
          (await caches.match(request))
          || (await caches.match(url.pathname))
          || (await caches.match("/"))
        )),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(shellCache);
            await cache.put(request, response.clone());
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
