const CACHE_NAME = "venuguestpass-pwa-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/offline-venuguestpass.html",
  "/offline-venuguestpass.js",
  "/manifest.webmanifest",
  "/venuguestpass-pwa-192.png",
  "/venuguestpass-pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("venuguestpass-pwa-") && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const isAttendeesPage =
          url.pathname === "/dashboard/attendees" ||
          url.pathname === "/dashboard/guestlist" ||
          /^\/dashboard\/events\/[^/]+\/guestlist\/add\/?$/.test(url.pathname);
        if (isAttendeesPage) {
          const offlineAttendeesPage = await cache.match("/offline-venuguestpass.html");
          if (offlineAttendeesPage) return offlineAttendeesPage;
        }
        const offlinePage = await cache.match(OFFLINE_URL);
        if (offlinePage) return offlinePage;
        return new Response("You’re offline. Reconnect and try again.", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          status: 503,
        });
      }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    PRECACHE_URLS.includes(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
