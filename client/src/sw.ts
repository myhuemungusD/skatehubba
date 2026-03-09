/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// ── Precaching ──────────────────────────────────────────────────────────
// Workbox injects the build-asset manifest here at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Map tile caching (CacheFirst, 30-day expiry, max 500 tiles) ──────
const TILE_CACHE = "skatehubba-map-tiles";

const tilePlugins = [
  new CacheableResponsePlugin({ statuses: [0, 200] }),
  new ExpirationPlugin({
    maxEntries: 500,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    purgeOnQuotaError: true,
  }),
];

// OSM tiles: https://{a|b|c}.tile.openstreetmap.org/{z}/{x}/{y}.png
registerRoute(
  ({ url }) => url.hostname.endsWith(".tile.openstreetmap.org"),
  new CacheFirst({ cacheName: TILE_CACHE, plugins: tilePlugins })
);

// CARTO dark tiles: https://{a|b|c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
registerRoute(
  ({ url }) => url.hostname.endsWith(".basemaps.cartocdn.com"),
  new CacheFirst({ cacheName: TILE_CACHE, plugins: tilePlugins })
);

// ── Static assets (StaleWhileRevalidate) ─────────────────────────────
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    (request.destination === "style" ||
      request.destination === "script" ||
      request.destination === "font" ||
      request.destination === "image"),
  new StaleWhileRevalidate({
    cacheName: "skatehubba-static-assets",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100 }),
    ],
  })
);

// ── Navigation requests ──────────────────────────────────────────────
const navigationRoute = new NavigationRoute(
  new NetworkFirst({ cacheName: "skatehubba-navigations", networkTimeoutSeconds: 3 }),
  { denylist: [/^\/api\//] }
);
registerRoute(navigationRoute);

// ── Offline fallback ─────────────────────────────────────────────────
setCatchHandler(async ({ event }) => {
  if (event instanceof FetchEvent && event.request.mode === "navigate") {
    const offlineResponse = await caches.match("/offline.html");
    if (offlineResponse) return offlineResponse;
  }
  return Response.error();
});

// ── Auto-update & legacy cleanup ─────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k === "skatehubba-v2" || k === "skatehubba-runtime")
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});
