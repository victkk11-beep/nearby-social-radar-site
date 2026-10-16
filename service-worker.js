const CACHE_NAME = "nearby-social-radar-public-v2";
const scopeUrl = new URL(self.registration.scope);
const snapshotUrl = new URL("data/opportunities.json", scopeUrl);
const appShell = [
  "",
  "styles.css?v=20261015-theme",
  "app.js?v=20261016-offline",
  "manifest.webmanifest",
  "icon.svg",
  "covers/competition.webp",
  "covers/exhibition.webp",
  "covers/internship.webp",
  "covers/lecture.webp",
  "covers/online.webp",
  "covers/part-time.webp",
  "covers/salon.webp",
  "covers/volunteer.webp",
  "covers/workshop.webp",
  "campus-story/aerial.webp",
  "campus-story/autumn.webp",
  "campus-story/gate.webp",
  "campus-story/innovation-harbor.webp",
  "campus-story/insignia.webp",
  "campus-story/sculpture.webp",
].map((path) => new URL(path, scopeUrl).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(appShell)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("nearby-social-radar-public-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname) || url.pathname.endsWith("/map-config.js")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE_NAME)).put(new URL("", scopeUrl).href, response.clone());
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || (await cache.match(scopeUrl.href)) || Response.error();
    }));
    return;
  }

  if (url.href === snapshotUrl.href) {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    }).catch(async () => {
      const cached = await (await caches.open(CACHE_NAME)).match(request);
      if (!cached) return Response.error();
      const headers = new Headers(cached.headers);
      headers.set("X-NSR-Offline", "true");
      return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
    }));
    return;
  }

  if (request.destination) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
  }
});
