import logger from "../logger";
import { getRedisClient } from "../redis";

/**
 * Service that discovers skateparks and skate shops near a location using
 * OpenStreetMap's Overpass API. This is a free, no-API-key-required data
 * source for real-world skatepark and skate shop locations.
 */

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export interface DiscoveredSpot {
  name: string;
  description: string;
  spotType: "park" | "bowl" | "street" | "other";
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  country: string;
}

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/** Minimal Fetch API Response — avoids @types/node version variance. */
interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/**
 * Cache to prevent hammering the Overpass API for the same area.
 * Uses Redis when available, falls back to in-memory Map.
 * Key: rounded lat/lng grid cell (0.25 degree grid ~= 28km).
 */
const discoveryCacheFallback = new Map<string, number>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_TTL_SECONDS = Math.ceil(CACHE_TTL_MS / 1000);
const GRID_SIZE = 0.25; // ~28km grid cells
const DISCOVERY_KEY_PREFIX = "osm_cache:";

/** Safe bounds for the Overpass API radius parameter */
export const MIN_RADIUS_METERS = 100;
export const MAX_RADIUS_METERS = 50000;

function getCacheKey(lat: number, lng: number): string {
  const gridLat = Math.round(lat / GRID_SIZE) * GRID_SIZE;
  const gridLng = Math.round(lng / GRID_SIZE) * GRID_SIZE;
  return `${gridLat.toFixed(2)},${gridLng.toFixed(2)}`;
}

/**
 * Check if we've already discovered spots for this area recently.
 */
export async function isAreaCached(lat: number, lng: number): Promise<boolean> {
  const key = getCacheKey(lat, lng);
  const redis = getRedisClient();

  if (redis) {
    try {
      const exists = await redis.exists(`${DISCOVERY_KEY_PREFIX}${key}`);
      return exists === 1;
    } catch (error) {
      logger.warn("[OSM] Redis cache check failed, falling back to memory", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const cachedAt = discoveryCacheFallback.get(key);
  if (!cachedAt) return false;
  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    discoveryCacheFallback.delete(key);
    return false;
  }
  return true;
}

/**
 * Query OpenStreetMap Overpass API for skateparks and skate shops near a lat/lng.
 * Searches for leisure=pitch+sport=skateboard, leisure=skatepark, and
 * shop=sports+sport=skateboard within a radius.
 * Results are cached per grid cell to avoid repeated API calls.
 */
export async function discoverSkateparks(
  lat: number,
  lng: number,
  radiusMeters: number = 50000
): Promise<DiscoveredSpot[]> {
  // Validate coordinates to prevent invalid Overpass queries
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    logger.warn("Invalid coordinates for OSM discovery", { lat, lng });
    return [];
  }
  // Clamp radius to safe bounds to prevent Overpass API abuse
  radiusMeters = Math.max(MIN_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, radiusMeters));

  // Check cache first - skip if we already queried this area recently
  if (await isAreaCached(lat, lng)) {
    logger.info(`Skipping OSM discovery - area already cached for (${lat}, ${lng})`);
    return [];
  }
  // Overpass QL query: find skateparks and skate shops within radius
  const query = `
    [out:json][timeout:10];
    (
      node["leisure"="pitch"]["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      way["leisure"="pitch"]["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      relation["leisure"="pitch"]["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      node["leisure"="skatepark"](around:${radiusMeters},${lat},${lng});
      way["leisure"="skatepark"](around:${radiusMeters},${lat},${lng});
      relation["leisure"="skatepark"](around:${radiusMeters},${lat},${lng});
      node["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      way["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      node["shop"="sports"]["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      way["shop"="sports"]["sport"="skateboard"](around:${radiusMeters},${lat},${lng});
      node["shop"="skateboard"](around:${radiusMeters},${lat},${lng});
      way["shop"="skateboard"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = (await fetch(OVERPASS_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })) as FetchResponse;

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn("Overpass API returned non-OK status", { status: response.status });
      return [];
    }

    const data = (await response.json()) as OverpassResponse;

    // Deduplicate by OSM ID (ways and relations can overlap with nodes)
    const seen = new Set<string>();
    const results: DiscoveredSpot[] = [];

    for (const el of data.elements) {
      const key = `${el.type}-${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;

      if (!elLat || !elLng) continue;

      const tags = el.tags ?? {};
      const shop = isSkateShop(tags);
      const defaultName = shop ? "Skate Shop" : "Skatepark";
      const name = tags.name || tags["name:en"] || defaultName;

      // Skip unnamed nodes that are just sport=skateboard tags on random things
      if (name === defaultName && !tags.leisure && !shop) continue;

      results.push({
        name,
        description: buildDescription(tags),
        spotType: inferSpotType(tags),
        lat: elLat,
        lng: elLng,
        address: buildAddress(tags),
        city: tags["addr:city"] || "",
        state: tags["addr:state"] || "",
        country: tags["addr:country"] || "",
      });
    }

    // Mark this area as cached
    const cacheKey = getCacheKey(lat, lng);
    const redis = getRedisClient();
    if (redis) {
      redis
        .set(`${DISCOVERY_KEY_PREFIX}${cacheKey}`, String(Date.now()), "EX", CACHE_TTL_SECONDS)
        .catch((error: unknown) => {
          logger.warn("[OSM] Redis cache write failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } else {
      discoveryCacheFallback.set(cacheKey, Date.now());
    }

    logger.info(`Discovered ${results.length} spots (parks/shops) from OSM near (${lat}, ${lng})`);
    return results;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn("Overpass API request timed out");
    } else {
      logger.warn("Failed to query Overpass API", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return [];
  }
}

function isSkateShop(tags: Record<string, string>): boolean {
  return tags.shop === "skateboard" || (tags.shop === "sports" && tags.sport === "skateboard");
}

function buildDescription(tags: Record<string, string>): string {
  const parts: string[] = [];
  const shop = isSkateShop(tags);

  if (tags.description) return tags.description;

  if (tags.surface) parts.push(`Surface: ${tags.surface}`);
  if (tags.lit === "yes") parts.push("Lit at night");
  if (tags.fee === "no" || tags.access === "yes") parts.push("Free to use");
  if (tags.opening_hours) parts.push(`Hours: ${tags.opening_hours}`);
  if (tags.wheelchair === "yes") parts.push("Wheelchair accessible");
  if (tags.covered === "yes") parts.push("Covered/indoor");
  if (tags.phone) parts.push(`Phone: ${tags.phone}`);
  if (tags.website) parts.push(`Website: ${tags.website}`);

  const label = shop ? "Skate shop" : "Skatepark";
  return parts.length > 0
    ? `${label} discovered from OpenStreetMap. ${parts.join(". ")}.`
    : `${label} discovered from OpenStreetMap.`;
}

function buildAddress(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags["addr:housenumber"] && tags["addr:street"]) {
    parts.push(`${tags["addr:housenumber"]} ${tags["addr:street"]}`);
  } else if (tags["addr:street"]) {
    parts.push(tags["addr:street"]);
  }
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  if (tags["addr:state"]) parts.push(tags["addr:state"]);
  return parts.join(", ");
}

function inferSpotType(tags: Record<string, string>): "park" | "bowl" | "street" | "other" {
  if (isSkateShop(tags)) return "other";

  const name = (tags.name || "").toLowerCase();
  if (name.includes("bowl")) return "bowl";
  if (tags.leisure === "skatepark" || tags.leisure === "pitch") return "park";
  return "park";
}
