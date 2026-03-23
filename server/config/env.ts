import { z } from "zod";

/**
 * MVP environment — only what's needed to run auth + games + spots.
 * No Redis, no Stripe, no MFA, no Resend, no AI keys.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.string().default("3001"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Firebase — required in production, optional in dev
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),

    // CORS
    ALLOWED_ORIGINS: z.string().optional(),

    // Dev admin bypass (dev/test only)
    DEV_ADMIN_BYPASS: z.enum(["true", "false"]).optional(),

    // Logging
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

    // DB pool tuning
    DB_POOL_MAX: z.coerce.number().int().positive().max(200).default(20),
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().max(300000).default(30000),
    DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().max(60000).default(5000),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(30000),
  })
  .superRefine((data, ctx) => {
    // Firebase credentials are required in production
    if (data.NODE_ENV === "production") {
      if (!data.FIREBASE_PROJECT_ID) {
        ctx.addIssue({ code: "custom", path: ["FIREBASE_PROJECT_ID"], message: "Required in production" });
      }
      if (!data.FIREBASE_CLIENT_EMAIL) {
        ctx.addIssue({ code: "custom", path: ["FIREBASE_CLIENT_EMAIL"], message: "Required in production" });
      }
      if (!data.FIREBASE_PRIVATE_KEY) {
        ctx.addIssue({ code: "custom", path: ["FIREBASE_PRIVATE_KEY"], message: "Required in production" });
      }
    }
  });

function validateEnv() {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (isTest) {
    return {
      NODE_ENV: "test",
      PORT: "3001",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    } as z.infer<typeof envSchema>;
  }

  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n");
      throw new Error(`Environment validation failed:\n${missing}`);
    }
    throw error;
  }
}

export const env = validateEnv();
