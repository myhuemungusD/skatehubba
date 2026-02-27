import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3001"),

  // Required for all environments
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  // JWT Secret - required in ALL non-test environments, minimum 32 characters.
  // No fallback, no auto-generation. Fail-fast at boot if missing.
  // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  JWT_SECRET: z
    .string({
      required_error:
        "JWT_SECRET is required. Set it in your .env file (minimum 32 characters).\n" +
        "  Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    })
    .min(32, "JWT_SECRET must be at least 32 characters for security"),

  // Replit environment (optional)
  REPL_ID: z.string().optional(),
  CLIENT_SECRET: z.string().optional(),
  REPLIT_DOMAINS: z.string().optional(),
  ISSUER_URL: z.string().optional(),
  REPL_SLUG: z.string().optional(),
  REPL_OWNER: z.string().optional(),

  // Firebase (required for auth to work, but optional for basic mode)
  FIREBASE_ADMIN_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  IP_HASH_SALT: z.string().optional(),

  // Payment providers (optional unless payments are enabled)
  STRIPE_SECRET_KEY: z
    .string()
    .optional()
    .transform((val) => {
      const trimmed = val?.trim();
      // Allow empty/undefined in development
      if (!trimmed || trimmed === "" || process.env.NODE_ENV === "development") {
        return trimmed || undefined;
      }
      // In production, validate it's a secret key
      if (!trimmed.startsWith("sk_")) {
        throw new Error(
          "STRIPE_SECRET_KEY must start with sk_ (secret key, not publishable key pk_). Get your secret key from https://dashboard.stripe.com/apikeys"
        );
      }
      return trimmed;
    }),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      return val.trim();
    }),
  // Testing key used by test framework - allow empty string or valid sk_ key
  TESTING_STRIPE_SECRET_KEY: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      return val.trim();
    }),

  // Email services (optional)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_APP_PASSWORD: z.string().optional(),

  // AI services (optional)
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  // MFA encryption key (separate from JWT_SECRET for defense in depth)
  // Required in production to prevent sharing JWT signing material with MFA encryption.
  MFA_ENCRYPTION_KEY: z
    .string()
    .min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters")
    .optional()
    .refine((val) => !(process.env.NODE_ENV === "production" && !val), {
      message:
        "MFA_ENCRYPTION_KEY is required in production (must be separate from JWT_SECRET).\n" +
        "  Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    }),

  // Admin access (optional, but recommended for production)
  ADMIN_API_KEY: z.string().optional(),

  // Dev admin bypass (must be explicitly enabled)
  DEV_ADMIN_BYPASS: z.enum(["true", "false"]).optional(),

  // Monitoring & URLs
  SENTRY_DSN: z.string().optional(),
  PRODUCTION_URL: z.string().optional(),

  // CORS allowed origins (comma-separated)
  ALLOWED_ORIGINS: z.string().optional(),

  // Redis (optional — enables caching and session store)
  // L4: Require TLS (rediss://) in production; allow redis:// in development
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://")
    .refine(
      (val) => !(process.env.NODE_ENV === "production" && val && !val.startsWith("rediss://")),
      "REDIS_URL must use TLS (rediss://) in production"
    )
    .optional(),

  // M9: Cron endpoint protection — require 32-char minimum (consistent with other secrets)
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters").optional(),

  // Logging
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  // Firebase App Check enforcement mode — must match AppCheckMode in middleware/appCheck.ts
  // monitor: log only (default, safe for gradual rollout)
  // warn:    add warning header but allow request
  // enforce: reject requests without a valid App Check token
  APP_CHECK_MODE: z.enum(["monitor", "warn", "enforce"]).default("monitor"),

  // Spot check-in radius in metres (service hard cap: 150m)
  CHECK_IN_RADIUS_METERS: z.coerce
    .number()
    .positive()
    .max(150, "CHECK_IN_RADIUS_METERS cannot exceed 150m (service hard cap)")
    .default(100),

  // Database pool tuning (all optional with safe defaults)
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

function validateEnv() {
  // Skip validation in test mode - unit tests shouldn't require DB secrets
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (isTest) {
    return {
      NODE_ENV: "test",
      PORT: "3001",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
      JWT_SECRET: "test-jwt-secret-at-least-32-characters",
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
