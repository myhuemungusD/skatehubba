import { count, eq } from "drizzle-orm";
import { db } from "../server/db";
import logger from "../server/logger";
import { checkIns, spots, tricks } from "../shared/schema";

const SEEDER_TAG = "seed-demo";
const DEMO_USER_ID = "demo-user";

const seedSpots = [
  {
    name: "Burnside DIY",
    description: "Legendary DIY spot under the bridge.",
    spotType: "diy",
    tier: "legendary",
    lat: 45.523064,
    lng: -122.66928,
    city: "Portland",
    state: "OR",
    country: "USA",
    photoUrl: "https://images.skatehubba.com/spots/burnside.jpg",
    createdBy: SEEDER_TAG,
  },
  {
    name: "EMB Pier 7",
    description: "SF flatground heaven with smooth marble ledges.",
    spotType: "ledge",
    tier: "gold",
    lat: 37.795482,
    lng: -122.39312,
    city: "San Francisco",
    state: "CA",
    country: "USA",
    photoUrl: "https://images.skatehubba.com/spots/embarcadero.jpg",
    createdBy: SEEDER_TAG,
  },
  {
    name: "Love Park",
    description: "Iconic plaza reborn for lines and ledge tech.",
    spotType: "park",
    tier: "gold",
    lat: 39.95447,
    lng: -75.16403,
    city: "Philadelphia",
    state: "PA",
    country: "USA",
    photoUrl: "https://images.skatehubba.com/spots/love-park.jpg",
    createdBy: SEEDER_TAG,
  },
];

const seedTricks = [
  { name: "Kickflip", description: "Baseline flip trick for the feed.", createdBy: SEEDER_TAG },
  {
    name: "Switch Frontside 180",
    description: "Switch control with style.",
    createdBy: SEEDER_TAG,
  },
  {
    name: "Nollie Heelflip",
    description: "Nollie pop + heel for battle lines.",
    createdBy: SEEDER_TAG,
  },
];

async function main() {
  if (!db) {
    logger.error("Database not configured. Set DATABASE_URL before seeding.");
    process.exit(1);
  }

  const existing = await db
    .select({ count: count() })
    .from(spots)
    .where(eq(spots.createdBy, SEEDER_TAG));

  if (existing[0]?.count && Number(existing[0].count) > 0) {
    logger.info("Demo seed already present. Skipping.");
    return;
  }

  const insertedSpots = await db.insert(spots).values(seedSpots).returning({ id: spots.id });
  await db.insert(tricks).values(seedTricks);

  // Note: we intentionally do not seed check-ins for a hardcoded DEMO_USER_ID here.
  // Doing so previously caused failures on databases where that user did not exist
  // and foreign key constraints were enforced on checkIns.userId.
  logger.info("Demo seed complete", { spots: insertedSpots.length, tricks: seedTricks.length });
}

main().catch((error) => {
  logger.error("Demo seed failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
