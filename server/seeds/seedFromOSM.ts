/* eslint-disable no-console */
/**
 * Standalone seed script that bulk-imports real skatepark locations from
 * OpenStreetMap's Overpass API across major cities worldwide.
 *
 * Usage:
 *   pnpm seed:spots              # from repo root
 *   npx tsx seeds/seedFromOSM.ts  # from server/
 *
 * This queries OSM for skateparks/skate-related locations in ~60 cities and
 * inserts any that don't already exist (deduped by name + proximity).
 *
 * Safe to run multiple times — duplicates are skipped.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../../packages/shared/schema/index";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// ---------------------------------------------------------------------------
// Cities to query — covers major skate scenes worldwide
// ---------------------------------------------------------------------------
interface CityQuery {
  name: string;
  lat: number;
  lng: number;
  /** Search radius in meters (default 30km) */
  radius?: number;
}

const CITIES: CityQuery[] = [
  // North America — USA
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437, radius: 40000 },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194, radius: 30000 },
  { name: "New York", lat: 40.7128, lng: -74.006, radius: 30000 },
  { name: "Portland", lat: 45.5152, lng: -122.6784 },
  { name: "Seattle", lat: 47.6062, lng: -122.3321 },
  { name: "Chicago", lat: 41.8781, lng: -87.6298 },
  { name: "Philadelphia", lat: 39.9526, lng: -75.1652 },
  { name: "Austin", lat: 30.2672, lng: -97.7431 },
  { name: "Denver", lat: 39.7392, lng: -104.9903 },
  { name: "Phoenix", lat: 33.4484, lng: -112.074 },
  { name: "San Diego", lat: 32.7157, lng: -117.1611 },
  { name: "Miami", lat: 25.7617, lng: -80.1918 },
  { name: "Atlanta", lat: 33.749, lng: -84.388 },
  { name: "Minneapolis", lat: 44.9778, lng: -93.265 },
  { name: "Detroit", lat: 42.3314, lng: -83.0458 },
  { name: "Boston", lat: 42.3601, lng: -71.0589 },
  { name: "Houston", lat: 29.7604, lng: -95.3698 },
  { name: "Dallas", lat: 32.7767, lng: -96.797 },
  { name: "Salt Lake City", lat: 40.7608, lng: -111.891 },
  { name: "Nashville", lat: 36.1627, lng: -86.7816 },
  { name: "Tampa", lat: 27.9506, lng: -82.4572 },
  { name: "Washington DC", lat: 38.9072, lng: -77.0369 },
  { name: "Boise", lat: 43.615, lng: -116.2023 },
  { name: "Reno", lat: 39.5296, lng: -119.8138 },
  { name: "Sacramento", lat: 38.5816, lng: -121.4944 },
  { name: "San Jose", lat: 37.3382, lng: -121.8863 },
  { name: "Oakland", lat: 37.8044, lng: -122.2712 },
  { name: "Long Beach", lat: 33.77, lng: -118.1937 },

  // North America — Canada
  { name: "Vancouver", lat: 49.2827, lng: -123.1207 },
  { name: "Toronto", lat: 43.6532, lng: -79.3832 },
  { name: "Montreal", lat: 45.5017, lng: -73.5673 },
  { name: "Calgary", lat: 51.0447, lng: -114.0719 },

  // Europe
  { name: "Barcelona", lat: 41.3874, lng: 2.1686, radius: 25000 },
  { name: "London", lat: 51.5074, lng: -0.1278, radius: 35000 },
  { name: "Paris", lat: 48.8566, lng: 2.3522, radius: 30000 },
  { name: "Berlin", lat: 52.52, lng: 13.405, radius: 30000 },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041 },
  { name: "Copenhagen", lat: 55.6761, lng: 12.5683 },
  { name: "Malmö", lat: 55.604, lng: 13.003 },
  { name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393 },
  { name: "Madrid", lat: 40.4168, lng: -3.7038 },
  { name: "Lyon", lat: 45.764, lng: 4.8357 },
  { name: "Rotterdam", lat: 51.9244, lng: 4.4777 },
  { name: "Prague", lat: 50.0755, lng: 14.4378 },
  { name: "Vienna", lat: 48.2082, lng: 16.3738 },
  { name: "Athens", lat: 37.9838, lng: 23.7275 },

  // Asia-Pacific
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, radius: 30000 },
  { name: "Melbourne", lat: -37.8136, lng: 144.9631 },
  { name: "Sydney", lat: -33.8688, lng: 151.2093 },
  { name: "Seoul", lat: 37.5665, lng: 126.978 },
  { name: "Shanghai", lat: 31.2304, lng: 121.4737 },
  { name: "Manila", lat: 14.5995, lng: 120.9842 },

  // South America
  { name: "São Paulo", lat: -23.5505, lng: -46.6333, radius: 30000 },
  { name: "Buenos Aires", lat: -34.6037, lng: -58.3816 },
  { name: "Lima", lat: -12.0464, lng: -77.0428 },
  { name: "Bogotá", lat: 4.711, lng: -74.0721 },
  { name: "Santiago", lat: -33.4489, lng: -70.6693 },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332, radius: 30000 },

  // Africa / Middle East
  { name: "Cape Town", lat: -33.9249, lng: 18.4241 },
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473 },
  { name: "Tel Aviv", lat: 32.0853, lng: 34.7818 },
];

// ---------------------------------------------------------------------------
// Overpass API query
// ---------------------------------------------------------------------------
const OVERPASS_API = "https://overpass-api.de/api/interpreter";

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

interface DiscoveredSpot {
  name: string;
  description: string;
  spotType: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
  country: string;
  osmId: string;
}

async function queryCitySpots(city: CityQuery): Promise<DiscoveredSpot[]> {
  const radius = city.radius ?? 30000;
  const query = `
    [out:json][timeout:25];
    (
      node["leisure"="pitch"]["sport"="skateboard"](around:${radius},${city.lat},${city.lng});
      way["leisure"="pitch"]["sport"="skateboard"](around:${radius},${city.lat},${city.lng});
      relation["leisure"="pitch"]["sport"="skateboard"](around:${radius},${city.lat},${city.lng});
      node["leisure"="skatepark"](around:${radius},${city.lat},${city.lng});
      way["leisure"="skatepark"](around:${radius},${city.lat},${city.lng});
      relation["leisure"="skatepark"](around:${radius},${city.lat},${city.lng});
      node["sport"="skateboard"](around:${radius},${city.lat},${city.lng});
      way["sport"="skateboard"](around:${radius},${city.lat},${city.lng});
    );
    out center tags;
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(OVERPASS_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`  ⚠ Overpass returned ${response.status} for ${city.name}`);
      return [];
    }

    const data = (await response.json()) as OverpassResponse;
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
      const name = tags.name || tags["name:en"] || "";

      // Skip unnamed spots — they're usually just tagged areas
      if (!name) continue;

      // Skip skate shops (we only want skateable spots)
      if (tags.shop) continue;

      const descParts: string[] = [];
      if (tags.description) {
        descParts.push(tags.description);
      } else {
        if (tags.surface) descParts.push(`Surface: ${tags.surface}`);
        if (tags.lit === "yes") descParts.push("Lit at night");
        if (tags.fee === "no" || tags.access === "yes") descParts.push("Free to use");
        if (tags.opening_hours) descParts.push(`Hours: ${tags.opening_hours}`);
        if (tags.covered === "yes") descParts.push("Covered/indoor");
      }

      const desc =
        descParts.length > 0
          ? `Skatepark in ${city.name}. ${descParts.join(". ")}.`
          : `Skatepark in ${city.name} discovered from OpenStreetMap.`;

      const addrParts: string[] = [];
      if (tags["addr:housenumber"] && tags["addr:street"]) {
        addrParts.push(`${tags["addr:housenumber"]} ${tags["addr:street"]}`);
      } else if (tags["addr:street"]) {
        addrParts.push(tags["addr:street"]);
      }

      const spotType = (tags.name || "").toLowerCase().includes("bowl") ? "bowl" : "park";

      results.push({
        name,
        description: desc,
        spotType,
        lat: elLat,
        lng: elLng,
        address: addrParts.join(", "),
        city: tags["addr:city"] || city.name,
        state: tags["addr:state"] || "",
        country: tags["addr:country"] || "",
        osmId: key,
      });
    }

    return results;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`  ⚠ Timeout querying ${city.name}`);
    } else {
      console.warn(
        `  ⚠ Error querying ${city.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Haversine distance (meters) for dedup
// ---------------------------------------------------------------------------
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("dummy")) {
    console.error("✗ DATABASE_URL not set. Export it before running this script.");
    console.error(
      "  Example: DATABASE_URL=postgresql://user:pass@host/db npx tsx seeds/seedFromOSM.ts"
    );
    process.exit(1);
  }

  console.log("Connecting to database...");
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const db = drizzle(pool, { schema });

  // Fetch existing spots to avoid duplicates
  console.log("Loading existing spots for dedup...");
  const existingSpots = await db
    .select({
      name: schema.spots.name,
      lat: schema.spots.lat,
      lng: schema.spots.lng,
    })
    .from(schema.spots);

  console.log(`Found ${existingSpots.length} existing spots in database.\n`);

  function isDuplicate(name: string, lat: number, lng: number): boolean {
    for (const spot of existingSpots) {
      // Same name (case-insensitive)
      if (spot.name.toLowerCase() === name.toLowerCase()) return true;
      // Within 100m of an existing spot
      if (haversineMeters(spot.lat, spot.lng, lat, lng) < 100) return true;
    }
    return false;
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Process cities sequentially to be respectful to Overpass API
  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    console.log(
      `[${i + 1}/${CITIES.length}] Querying ${city.name} (${city.radius ?? 30000}m radius)...`
    );

    const spots = await queryCitySpots(city);
    console.log(`  Found ${spots.length} named spots from OSM`);

    let cityInserted = 0;
    for (const spot of spots) {
      if (isDuplicate(spot.name, spot.lat, spot.lng)) {
        totalSkipped++;
        continue;
      }

      try {
        await db.insert(schema.spots).values({
          name: spot.name,
          description: spot.description,
          spotType: spot.spotType,
          tier: "bronze",
          lat: spot.lat,
          lng: spot.lng,
          address: spot.address,
          city: spot.city,
          state: spot.state,
          country: spot.country,
          createdBy: "system",
          verified: true,
          isActive: true,
          checkInCount: 0,
          rating: 0,
          ratingCount: 0,
        });

        // Track for future dedup within this run
        existingSpots.push({ name: spot.name, lat: spot.lat, lng: spot.lng });
        cityInserted++;
        totalInserted++;
      } catch (error) {
        totalErrors++;
        console.warn(
          `  ⚠ Failed to insert "${spot.name}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (cityInserted > 0) {
      console.log(`  ✓ Inserted ${cityInserted} new spots`);
    }

    // Rate limit: wait 2s between queries to be polite to Overpass
    if (i < CITIES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log("\n========================================");
  console.log(
    `Done! Inserted: ${totalInserted} | Skipped (dupes): ${totalSkipped} | Errors: ${totalErrors}`
  );
  console.log("========================================");

  await pool.end();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
