import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../packages/shared/schema.ts";
import { env } from "./config/env";
import logger from "./logger";

const { Pool } = pg;

// Properly typed Drizzle database instance
type DatabaseSchema = typeof schema;
type Database = NodePgDatabase<DatabaseSchema>;

// Database instance - will be null if not configured
let db: Database | null = null;
let pool: pg.Pool | null = null;

try {
  if (env.DATABASE_URL && env.DATABASE_URL !== "postgresql://dummy:dummy@localhost:5432/dummy") {
    pool = new Pool({ connectionString: env.DATABASE_URL });
    db = drizzle(pool, { schema });
    logger.info("Database connection pool created");
  }
} catch (error) {
  logger.warn("Database connection setup failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  db = null;
  pool = null;
}

/**
 * Get database instance with null check.
 * Throws if database is not configured.
 * Use this in routes/services that require database access.
 */
export function getDb(): Database {
  if (!db) {
    throw new Error("Database not configured");
  }
  return db;
}

/**
 * Check if database is available without throwing.
 */
export function isDatabaseAvailable(): boolean {
  return db !== null;
}

export { db, pool };
export type { Database };

/**
 * Helper to assert database is available.
 * Use this when you need guaranteed database access.
 * @throws Error if database is not configured
 */
export function requireDb(): Database {
  if (!db) {
    throw new Error("Database not configured");
  }
  return db;
}

export async function initializeDatabase() {
  if (!db) {
    logger.info("Database not configured, skipping initialization");
    return;
  }

  try {
    logger.info("Initializing database...");

    await db.select().from(schema.tutorialSteps).limit(1);
    logger.info("Database connection successful");

    const existingSteps = await db.select().from(schema.tutorialSteps).limit(1);

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
  } catch (error) {
    logger.error("Database initialization failed - continuing without default tutorial steps", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (env.NODE_ENV === "production") {
      throw error;
    }
  }
}
