const CACHE_PREFIX = "panda-drama-assistant-";
const CACHE_NAME = `${CACHE_PREFIX}shell-v64`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/login",
  "/login.html",
  "/login.js",
  "/logs",
  "/logs.html",
  "/calendar",
  "/calendar.html",
  "/rankings",
  "/rankings.html",
  "/filters",
  "/filters.html",
  "/styles.css",
  "/calendar.css",
  "/theme.js",
  "/cover-image.js",
  "/pwa.js",
  "/app.js",
  "/logs.js",
  "/calendar-events.js",
  "/calendar-reservations.js",
  "/calendar-schedule.js",
  "/calendar.js",
  "/rankings.js",
  "/filters.js",
  "/scroll-controls.js",
  "/manifest.webmanifest",
  "/assets/panda-drama-assistant-icon.svg",
  "/assets/panda-drama-assistant-icon.png",
  "/assets/pwa-icon-192.png",
  "/assets/pwa-icon-512.png",
  "/assets/pwa-icon-maskable-512.png",
  "/assets/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
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
            .filter(
              (cacheName) =>
                cacheName.startsWith(CACHE_PREFIX) &&
                cacheName !== CACHE_NAME,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await cache.match(request, {
      ignoreSearch: request.mode === "navigate",
    });
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === "navigate") {
      const appShell = await cache.match("/");
      if (appShell) {
        return appShell;
      }
    }

    return new Response("Offline", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith(networkFirst(request));
});
