import logger from "../logger";

/**
 * Service that discovers skateparks near a location using OpenStreetMap's Overpass API.
 * This is a free, no-API-key-required data source for real-world skatepark locations.
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
  spotType: "park" | "bowl" | "street";
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  country: string;
}

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

/**
 * In-memory cache to prevent hammering the Overpass API for the same area.
 * Key: rounded lat/lng grid cell (0.25 degree grid ~= 28km).
 * Value: timestamp of last query.
 * Cache entries expire after 1 hour.
 * LRU eviction when cache exceeds max size.
 */
const MAX_CACHE_SIZE = 500; // Limit cache to 500 entries
const discoveryCache = new Map<string, number>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GRID_SIZE = 0.25; // ~28km grid cells

/**
 * Evict oldest entries when cache exceeds max size.
 * Uses LRU (Least Recently Used) strategy.
 */
function evictOldestIfNeeded(): void {
  if (discoveryCache.size >= MAX_CACHE_SIZE) {
    // Find oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, timestamp] of discoveryCache.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      discoveryCache.delete(oldestKey);
    }
  }
}

function getCacheKey(lat: number, lng: number): string {
  const gridLat = Math.round(lat / GRID_SIZE) * GRID_SIZE;
  const gridLng = Math.round(lng / GRID_SIZE) * GRID_SIZE;
  return `${gridLat.toFixed(2)},${gridLng.toFixed(2)}`;
}

/**
 * Check if we've already discovered spots for this area recently.
 */
export function isAreaCached(lat: number, lng: number): boolean {
  const key = getCacheKey(lat, lng);
  const cachedAt = discoveryCache.get(key);
  if (!cachedAt) return false;
  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    discoveryCache.delete(key);
    return false;
  }
  return true;
}

/**
 * Query OpenStreetMap Overpass API for skateparks near a lat/lng.
 * Searches for leisure=pitch+sport=skateboard and leisure=skatepark within a radius.
 * Results are cached per grid cell to avoid repeated API calls.
 */
export async function discoverSkateparks(
  lat: number,
  lng: number,
  radiusMeters: number = 50000
): Promise<DiscoveredSpot[]> {
  // Validate inputs to prevent query manipulation
  if (
    typeof radiusMeters !== "number" ||
    radiusMeters < 1000 ||
    radiusMeters > 100000 ||
    !Number.isFinite(radiusMeters)
  ) {
    logger.warn("Invalid radiusMeters parameter", { radiusMeters });
    radiusMeters = 50000; // Default to safe value
  }

  // Check cache first - skip if we already queried this area recently
  if (isAreaCached(lat, lng)) {
    logger.info(`Skipping OSM discovery - area already cached for (${lat}, ${lng})`);
    return [];
  }
  // Overpass QL query: find skateparks (nodes, ways, relations) within radius
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
    );
    out center tags;
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(OVERPASS_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

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
      const name = tags.name || tags["name:en"] || "Skatepark";

      // Skip unnamed nodes that are just sport=skateboard tags on random things
      if (name === "Skatepark" && !tags.leisure) continue;

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
    evictOldestIfNeeded();
    discoveryCache.set(getCacheKey(lat, lng), Date.now());

    logger.info(`Discovered ${results.length} skateparks from OSM near (${lat}, ${lng})`);
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

function buildDescription(tags: Record<string, string>): string {
  const parts: string[] = [];

  if (tags.description) return tags.description;

  if (tags.surface) parts.push(`Surface: ${tags.surface}`);
  if (tags.lit === "yes") parts.push("Lit at night");
  if (tags.fee === "no" || tags.access === "yes") parts.push("Free to use");
  if (tags.opening_hours) parts.push(`Hours: ${tags.opening_hours}`);
  if (tags.wheelchair === "yes") parts.push("Wheelchair accessible");
  if (tags.covered === "yes") parts.push("Covered/indoor");

  return parts.length > 0
    ? `Skatepark discovered from OpenStreetMap. ${parts.join(". ")}.`
    : "Skatepark discovered from OpenStreetMap.";
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

function inferSpotType(tags: Record<string, string>): "park" | "bowl" | "street" {
  const name = (tags.name || "").toLowerCase();
  if (name.includes("bowl")) return "bowl";
  if (tags.leisure === "skatepark" || tags.leisure === "pitch") return "park";
  return "park";
}
