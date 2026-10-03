// VESYN assistant service worker: enough to install the app and keep it readable offline.
//
// The one rule that matters: the research service is never cached. A stale route score or a stale memory
// count served from a cache would be a wrong answer presented as a current one, so /api, /health and
// anything non-GET go to the network and nowhere else. What is cached is the shell, the icons, and the
// recorded investigation the app shows when the backend cannot be reached.

const VERSION = "vesyn-v3-light";
const SHELL = VERSION + "-shell";
const ASSETS = VERSION + "-assets";

// The app shell and the recorded run, so a phone that has opened the app once still opens it with no
// network at all - which is how it survives a presentation on a bad connection.
const PRECACHE = ["/assistant", "/assistant/research", "/assistant/memory", "/assistant/history", "/assistant/profile", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/demo/run.json", "/demo/before.json"];

const live = (url) =>
  url.pathname.startsWith("/api/") || url.pathname === "/health" || url.pathname.startsWith("/retrosynthesis/") || url.pathname.startsWith("/molecules/");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => Promise.all(PRECACHE.map(async (path) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Precache failed: ${path}`);
        await cache.put(path, response.clone());
        if (!path.startsWith("/assistant")) return;
        // Include first-render JS/CSS too: installing happens after their initial requests.
        const html = await response.text();
        const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]+)"/g)]
          .map((match) => match[1].replace(/&amp;/g, "&"))
          .filter((url) => url.startsWith("/_next/static/")))];
        const assetCache = await caches.open(ASSETS);
        await Promise.all(assets.map((url) => assetCache.add(url)));
      })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("vesyn-v") && n !== SHELL && n !== ASSETS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // another origin (the API usually is one) or the research service itself: straight to the network
  if (url.origin !== self.location.origin || live(url)) return;

  // a page: the network decides, the shell answers when there is none
  if (request.mode === "navigate") {
    if (!url.pathname.startsWith("/assistant")) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/assistant"))),
    );
    return;
  }

  // build output is content-hashed and immutable; serve it from the cache and stop asking
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            if (response.ok) event.waitUntil(caches.open(ASSETS).then((cache) => cache.put(request, copy)));
            return response;
          }),
      ),
    );
    return;
  }

  // everything else of ours: fresh when possible, the last copy when not
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(ASSETS).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
