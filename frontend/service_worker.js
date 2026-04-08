const CACHE_NAME = "mnemo-v1";
const SHELL_URLS = [
  "/",
  "/index.html",
  "/src/App.jsx",
  "/manifest.json",
];

// Install: cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for API requests
  if (url.pathname.startsWith("/topics") ||
      url.pathname.startsWith("/session") ||
      url.pathname.startsWith("/history")) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Cache-first for shell assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// TODO v1.1: push notification handler
// self.addEventListener("push", (event) => { ... });
