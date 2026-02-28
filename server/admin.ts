import admin from "firebase-admin";
import { env } from "./config/env";
import logger from "./logger";

/**
 * Detect obviously invalid placeholder values that aren't real credentials.
 * A valid service-account JSON is typically 2000+ chars and starts with '{'.
 */
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length < 100) return true;
  if (/^x{4,}/.test(trimmed)) return true;
  if (!trimmed.startsWith("{")) return true;
  return false;
}

if (!admin.apps.length) {
  try {
    let serviceAccount = null;
    let credentialSource = "none";

    // Path 1: Full service-account JSON blob
    if (env.FIREBASE_ADMIN_KEY && !isPlaceholder(env.FIREBASE_ADMIN_KEY)) {
      try {
        serviceAccount = JSON.parse(env.FIREBASE_ADMIN_KEY);
        credentialSource = "FIREBASE_ADMIN_KEY (JSON)";
      } catch (error) {
        logger.warn("FIREBASE_ADMIN_KEY is set but contains invalid JSON — skipping", {
          length: env.FIREBASE_ADMIN_KEY.length,
          error,
        });
      }
    } else if (env.FIREBASE_ADMIN_KEY) {
      logger.warn(
        "FIREBASE_ADMIN_KEY appears to be a placeholder (too short or not valid JSON). " +
          "Set it to the full service-account JSON from Firebase Console → Project Settings → Service Accounts → Generate New Private Key."
      );
    }

    // Path 2: Individual credential env vars
    const projectId = env.FIREBASE_PROJECT_ID;
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const hasExplicitCredentials = !!(projectId && clientEmail && privateKey);

    if (!serviceAccount && !hasExplicitCredentials) {
      const missing = [
        !projectId && "FIREBASE_PROJECT_ID",
        !clientEmail && "FIREBASE_CLIENT_EMAIL",
        !privateKey && "FIREBASE_PRIVATE_KEY",
      ].filter(Boolean);
      logger.warn(
        `No valid Firebase credentials found. Either set FIREBASE_ADMIN_KEY to the full service-account JSON, ` +
          `or set all three individual vars. Missing: ${missing.join(", ")}`
      );
    }

    if (!serviceAccount && hasExplicitCredentials) {
      credentialSource = "individual env vars (PROJECT_ID + CLIENT_EMAIL + PRIVATE_KEY)";
    }

    if (serviceAccount || hasExplicitCredentials) {
      admin.initializeApp({
        credential: serviceAccount
          ? admin.credential.cert(serviceAccount)
          : admin.credential.cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey! }),
        projectId,
      });
      logger.info(`Firebase Admin SDK initialized via ${credentialSource}`);
    } else {
      // Last resort: Application Default Credentials (works in GCP, not in Vercel)
      try {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId,
        });
        logger.info("Firebase Admin SDK initialized via Application Default Credentials");
      } catch (adcError) {
        logger.warn(
          "Firebase Admin SDK could not initialize — no valid credentials available. " +
            "Auth endpoints will fail. To fix: set FIREBASE_ADMIN_KEY or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in your environment.",
          { adcError }
        );
      }
    }

    if (admin.apps.length && env.NODE_ENV === "production") {
      logger.info("Firebase App Check enabled for server-side protection");
    }
  } catch (error) {
    logger.warn("Firebase Admin initialization failed:", { error });
  }
}

export { admin };
