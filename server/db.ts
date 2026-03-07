import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "../packages/shared/schema/index";
import { eq } from "drizzle-orm";
import { env } from "./config/env";
import logger from "./logger";
import { defaultSpots } from "./seeds/defaultSpots";

// Provide an explicit WebSocket implementation for the Neon serverless driver.
// The global WebSocket may be unavailable in bundled serverless environments
// (esbuild inlines everything, so the global can be lost). The `ws` package
// is a reliable fallback that works in all Node.js runtimes.
import ws from "ws";
neonConfig.webSocketConstructor = ws;

// Properly typed Drizzle database instance
type DatabaseSchema = typeof schema;
type Database = NeonDatabase<DatabaseSchema>;

// Database instance - will be null if not configured
let db: Database | null = null;
let pool: Pool | null = null;

try {
  if (env.DATABASE_URL && env.DATABASE_URL !== "postgresql://dummy:dummy@localhost:5432/dummy") {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    });

    // Prevent unhandled rejections from idle clients disconnecting
    pool.on("error", (err: Error) => {
      logger.error("Unexpected error on idle database client", {
        error: err.message,
      });
    });

    // Apply connection-level settings (e.g. statement_timeout) to every new connection.
    // Use parameterized value to prevent SQL injection via env.DB_STATEMENT_TIMEOUT_MS.
    const statementTimeoutMs = Number(env.DB_STATEMENT_TIMEOUT_MS);
    pool.on(
      "connect",
      (client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }) => {
        client
          .query(`SET statement_timeout = $1`, [String(statementTimeoutMs)])
          .catch((err: unknown) => {
            logger.error("Failed to set statement_timeout on new connection", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
    );

    db = drizzle(pool, { schema });
    logger.info("Neon serverless database pool created", {
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
      statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
    });
  }
} catch (error) {
  logger.warn("Database connection setup failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  db = null;
  pool = null;
}

/**
 * Error thrown when the database is not configured or unavailable.
 * The global error handler maps this to a 503 response.
 */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Database not configured");
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Get database instance with null check.
 * Throws {@link DatabaseUnavailableError} if database is not configured.
 * Use this in routes/services that require database access.
 */
export function getDb(): Database {
  if (!db) {
    throw new DatabaseUnavailableError();
  }
  return db;
}

/**
 * Check if database is available without throwing.
 *
 * **Only use in health-check / monitoring code.**
 * Route handlers should call {@link getDb} and let the global error handler
 * return 503 automatically.
 */
export function isDatabaseAvailable(): boolean {
  return db !== null;
}

/**
 * Get both display name and handle for a user in a single query path.
 * Queries usernames table first; falls back to customUsers.firstName for display name.
 */
export async function getUserNameInfo(
  db: Database,
  userId: string
): Promise<{ displayName: string; handle: string | null }> {
  const usernameResult = await db
    .select({ username: schema.usernames.username })
    .from(schema.usernames)
    .where(eq(schema.usernames.uid, userId))
    .limit(1);

  if (usernameResult[0]?.username) {
    return { displayName: usernameResult[0].username, handle: usernameResult[0].username };
  }

  const userResult = await db
    .select({ firstName: schema.customUsers.firstName })
    .from(schema.customUsers)
    .where(eq(schema.customUsers.id, userId))
    .limit(1);

  return { displayName: userResult[0]?.firstName || "Skater", handle: null };
}

/** Get user display name. Delegates to {@link getUserNameInfo}. */
export async function getUserDisplayName(db: Database, userId: string): Promise<string> {
  return (await getUserNameInfo(db, userId)).displayName;
}

/** Get user handle (username). Delegates to {@link getUserNameInfo}. */
export async function getUserHandle(db: Database, userId: string): Promise<string | null> {
  return (await getUserNameInfo(db, userId)).handle;
}

export { db, pool };
export type { Database };

/**
 * Alias for {@link getDb} — kept for call-sites that prefer the name.
 * @throws Error if database is not configured
 */
export const requireDb = getDb;

export async function initializeDatabase() {
  if (!db) {
    logger.info("Database not configured, skipping initialization");
    return;
  }

  try {
    logger.info("Initializing database...");

    const existingSteps = await db.select().from(schema.tutorialSteps).limit(1);
    logger.info("Database connection successful");

    if (existingSteps.length === 0) {
      logger.info("Seeding tutorial steps...");
      const defaultSteps = [
        {
          title: "Welcome to SkateHubba",
          description: "Learn the basics of navigating the skate community",
          type: "intro" as const,
          content: { videoUrl: "https://example.com/intro-video" },
          order: 1,
          isActive: true,
        },
      ];
      for (const step of defaultSteps) {
        await db.insert(schema.tutorialSteps).values(step);
      }
      logger.info("Tutorial steps seeded successfully");
    } else {
      logger.info("Tutorial steps already initialized");
    }

    // Seed default skateparks and legendary spots
    const existingSpots = await db.select().from(schema.spots).limit(1);

    if (existingSpots.length === 0) {
      logger.info(`Seeding ${defaultSpots.length} default skateparks and spots...`);
      for (const spot of defaultSpots) {
        await db.insert(schema.spots).values({
          name: spot.name,
          description: spot.description,
          spotType: spot.spotType,
          tier: spot.tier,
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
      }
      logger.info("Default skateparks seeded successfully");
    } else {
      logger.info("Spots already exist, skipping default seed");
    }
  } catch (error) {
    logger.error("Database initialization failed - continuing without defaults", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (env.NODE_ENV === "production") {
      throw error;
    }
  }
}
