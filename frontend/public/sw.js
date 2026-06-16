const CACHE = "biblioteca-v3";
const STATIC = ["/offline.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/")) return;
  if (e.request.url.includes("_next/static")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const resClone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, resClone));
          }
          return res;
        })
        .catch(() =>
          caches.match("/offline.html").then(
            (r) => r || new Response("Offline", { status: 503 })
          )
        );
    })
  );
});
