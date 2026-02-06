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
 * Query OpenStreetMap Overpass API for skateparks near a lat/lng.
 * Searches for leisure=pitch+sport=skateboard and leisure=skatepark within a radius.
 */
export async function discoverSkateparks(
  lat: number,
  lng: number,
  radiusMeters: number = 50000
): Promise<DiscoveredSpot[]> {
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
