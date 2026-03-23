import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";
import { env } from "./config/env";
import logger from "./logger";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

type DatabaseSchema = typeof schema;
type Database = NeonDatabase<DatabaseSchema>;

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

    pool.on("error", (err: Error) => {
      logger.error("Unexpected error on idle database client", { error: err.message });
    });

    pool.on(
      "connect",
      (client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }) => {
        client
          .query(`SET statement_timeout = $1`, [String(env.DB_STATEMENT_TIMEOUT_MS)])
          .catch((err: unknown) => {
            logger.error("Failed to set statement_timeout", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
    );

    db = drizzle(pool, { schema });
    logger.info("Database pool created", { max: env.DB_POOL_MAX });
  }
} catch (error) {
  logger.warn("Database connection setup failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  db = null;
  pool = null;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Database not configured");
    this.name = "DatabaseUnavailableError";
  }
}

export function getDb(): Database {
  if (!db) throw new DatabaseUnavailableError();
  return db;
}

export function isDatabaseAvailable(): boolean {
  return db !== null;
}

export { db, pool };
export type { Database };
