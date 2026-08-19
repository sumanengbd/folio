const VERSION = "1.0";
const CACHE = "folio-v" + VERSION;
const SHELL = [
  "./index.html",
  "./sw.js",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/boot.js",
  "./js/protect.js",
  "./js/app.js",
  "./js/folio-extra.js",
  "./js/vendor/sortable.min.js",
  "./js/vendor/jspdf.umd.min.js",
  "./js/vendor/jszip.min.js",
  "./js/vendor/pdf-lib.min.js",
  "./js/vendor/pdf.min.mjs",
  "./js/vendor/pdf.worker.min.mjs",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/icon-maskable-512.png",
  "./img/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async url => {
      const res = await fetch(url, { cache: "reload" });
      if (!res.ok) throw new Error("cache fail " + url);
      await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
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
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    let cached = await caches.match(event.request, { ignoreSearch: true });
    if (!cached && event.request.mode === "navigate") {
      cached = await caches.match("./index.html", { ignoreSearch: true });
    }
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, res.clone());
      }
      return res;
    } catch {
      if (event.request.mode === "navigate") {
        return caches.match("./index.html", { ignoreSearch: true });
      }
      throw new Error("offline");
    }
  })());
});
