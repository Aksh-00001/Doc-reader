const CACHE_NAME = "doc-reader-v3";
const APP_SHELL = ["/", "/manifest.json", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method === "POST" && new URL(event.request.url).pathname === "/") {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.get("file");
        if (file) {
          const cache = await caches.open("shared-files");
          const headers = new Headers();
          headers.set("X-File-Name", encodeURIComponent(file.name));
          headers.set("Content-Type", file.type);
          await cache.put("/shared-file", new Response(file, { headers }));
        }
      } catch (err) {
        console.error("Share error:", err);
      }
      return Response.redirect("/?shared=true", 303);
    })());
    return;
  }

  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(
    fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
      .catch(() => caches.match(event.request))
  );
});
