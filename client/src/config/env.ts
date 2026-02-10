import { z } from 'zod';

const envSchema = z.object({
  MODE: z.string().default('development'),
  DEV: z.boolean().default(true),
  PROD: z.boolean().default(false),

  EXPO_PUBLIC_SENTRY_DSN: z.string().optional(),

  EXPO_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),

  EXPO_PUBLIC_RECAPTCHA_SITE_KEY: z.string().optional(), // ReCAPTCHA v3 site key for App Check

  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  EXPO_PUBLIC_DONATE_STRIPE_URL: z.string().optional(),
  EXPO_PUBLIC_DONATE_PAYPAL_URL: z.string().optional(),
});

function validateEnv() {
  try {
    const parsed = envSchema.parse(import.meta.env);
    
    // Validate critical Firebase config in production
    if (import.meta.env.PROD) {
      if (!parsed.EXPO_PUBLIC_FIREBASE_API_KEY || parsed.EXPO_PUBLIC_FIREBASE_API_KEY === 'undefined') {
        console.error('[ENV] CRITICAL: EXPO_PUBLIC_FIREBASE_API_KEY is missing in production!');
      }
      if (!parsed.EXPO_PUBLIC_FIREBASE_PROJECT_ID || parsed.EXPO_PUBLIC_FIREBASE_PROJECT_ID === 'undefined') {
        console.error('[ENV] CRITICAL: EXPO_PUBLIC_FIREBASE_PROJECT_ID is missing in production!');
      }
    }
    
    return parsed;
  } catch (error) {
    console.error('[ENV] Environment validation failed:', error);
    if (error instanceof z.ZodError) {
      // In production, log the specific missing variables
      if (import.meta.env.PROD) {
        console.error('[ENV] Validation errors:', error.errors);
        throw new Error('Critical environment variables missing. Cannot start application.');
      }
    }
    // Development fallback only
    console.warn('[ENV] Using fallback empty env for development');
    return envSchema.parse({});
  }
}

export const env = validateEnv();
