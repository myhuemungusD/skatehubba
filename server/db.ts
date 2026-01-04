import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from "../shared/schema.ts";
import { env } from './config/env';
import logger from './logger';

const { Pool } = pg;

let db: any = null;
let pool: pg.Pool | null = null;

try {
  if (env.DATABASE_URL && env.DATABASE_URL !== 'postgresql://dummy:dummy@localhost:5432/dummy') {
    pool = new Pool({ connectionString: env.DATABASE_URL });
    db = drizzle(pool, { schema });
    logger.info('Database connection pool created');
  }
} catch (error) {
  logger.warn('Database connection setup failed', { error: error instanceof Error ? error.message : String(error) });
  db = null;
  pool = null;
}

export { db, pool };

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
          isActive: true
        }
      ];
      for (const step of defaultSteps) {
        await db.insert(schema.tutorialSteps).values(step);
      }
      logger.info("Tutorial steps seeded successfully");
    } else {
      logger.info("Tutorial steps already initialized");
    }
  } catch (error) {
    logger.error("Database initialization failed - continuing without default tutorial steps", { error: error instanceof Error ? error.message : String(error) });
    if (env.NODE_ENV === 'production') {
      throw error;
    }
  }
}