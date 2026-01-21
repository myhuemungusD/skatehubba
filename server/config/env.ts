import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3001"),

  // Required for all environments
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  // JWT Secret - required in production, has dev fallback (SECURITY: Change in production!)
  JWT_SECRET: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("JWT_SECRET is required in production");
        } else {
          console.warn("JWT_SECRET not set, using fallback for dev");
        }
      }
      return val || "dev-jwt-secret-change-in-production-32chars";
    }),

  // Replit environment (optional)
  REPL_ID: z.string().optional(),
  CLIENT_SECRET: z.string().optional(),
  REPLIT_DOMAINS: z.string().optional(),
  ISSUER_URL: z.string().optional(),
  REPL_SLUG: z.string().optional(),
  REPL_OWNER: z.string().optional(),

  // Firebase (required for auth to work, but optional for basic mode)
  VITE_FIREBASE_PROJECT_ID: z.string().optional(),
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

  // Admin access (optional, but recommended for production)
  ADMIN_API_KEY: z.string().optional(),

  // Monitoring & URLs
  SENTRY_DSN: z.string().optional(),
  PRODUCTION_URL: z.string().optional(),
});

function validateEnv() {
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
