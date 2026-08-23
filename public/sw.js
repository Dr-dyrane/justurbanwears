const RELEASE_TOKEN = "__JUW_RELEASE_TOKEN__";
const SHELL_CACHE = `justurban-wears-public-shell-${RELEASE_TOKEN}`;
const OFFLINE_DOCUMENT = "/offline.html";
const PRECACHE_URLS = [OFFLINE_DOCUMENT];

function isPublicStorefrontNavigation(url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  return (
    path === "/" ||
    path === "/shop" ||
    path === "/shop/search" ||
    path.startsWith("/shop/products/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("justurban-wears-public-shell-") &&
                cacheName !== SHELL_CACHE,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET" || request.mode !== "navigate") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || !isPublicStorefrontNavigation(url)) {
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const offlineResponse = await caches.match(OFFLINE_DOCUMENT, {
        cacheName: SHELL_CACHE,
        ignoreSearch: true,
      });

      return offlineResponse ?? Response.error();
    }),
  );
});
