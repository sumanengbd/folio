const CACHE = "folio-v2";
const SHELL = [
  "./pdftools.html",
  "./manifest.webmanifest",
  "./js/boot.js",
  "./js/app.js",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/icon-maskable-512.png",
  "./img/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const res = await fetch(event.request);
      if (res.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = res.clone();
        const cache = await caches.open(CACHE);
        cache.put(event.request, copy);
      }
      return res;
    } catch {
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./pdftools.html");
      throw new Error("offline");
    }
  })());
});
