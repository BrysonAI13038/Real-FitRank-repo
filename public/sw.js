// Basic offline shell. Pages are network-first (updates arrive on the next open) and
// fall back to the cached page offline. Hashed /assets/* and fonts are cache-first.
// Workout data lives in localStorage, so it is never touched here.
const CACHE = "fitrank-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png", "/icons/logo-mark.png",
  "/fonts/barlow-condensed-500.woff2", "/fonts/barlow-condensed-600.woff2", "/fonts/barlow-condensed-700.woff2", "/fonts/inter-latin.woff2"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch("/", { cache: "no-store" });
    const assets = [...(await page.clone().text()).matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
    await cache.put("/", page);
    await cache.addAll([...SHELL.filter(url => url !== "/"), ...assets]);
    // Drop assets from earlier builds so the cache doesn't grow with every deploy.
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/assets/") && !assets.includes(path)) await cache.delete(request);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE && name.startsWith("fitrank-")) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE)).put("/", response.clone());
        return response;
      } catch {
        return (await caches.match("/")) ?? Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
  }
});
