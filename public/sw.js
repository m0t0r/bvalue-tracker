// RESEARCH PROTOTYPE (instant /insights): the pages' HTML answered from the worker's cache and
// refreshed behind it, and their hashed assets kept beside it so an old page never lacks its files.
const CACHE = "sgc-swarm:shell-v1";
const PAGES = ["/", "/choco", "/insights"];

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    PAGES.map(async (page) => {
      const res = await fetch(page, { cache: "no-cache" });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put(page, res);
      const assets = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all([...new Set(assets)].map(async (a) => (await cache.match(a)) || cache.add(a).catch(() => {})));
    }),
  );
}

self.addEventListener("install", (e) => e.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function page(path, event) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(path);
  const fresh = fetch(path, { cache: "no-cache" })
    .then((res) => (res.ok ? cache.put(path, res.clone()).then(() => res) : res))
    .catch(() => kept);
  if (!kept) return fresh;
  event.waitUntil(fresh);
  return kept;
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request.url);
  if (kept) return kept;
  const res = await fetch(request);
  if (res.ok) void cache.put(request.url, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === "navigate" && PAGES.includes(url.pathname)) event.respondWith(page(url.pathname, event));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(asset(request));
});
