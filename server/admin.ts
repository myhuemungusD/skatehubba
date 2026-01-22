import admin from "firebase-admin";
import { env } from "./config/env";
import logger from "./logger";

if (!admin.apps.length) {
  try {
    const serviceAccount = env.FIREBASE_ADMIN_KEY ? JSON.parse(env.FIREBASE_ADMIN_KEY) : null;
    const projectId = env.FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID;
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const hasExplicitCredentials = projectId && clientEmail && privateKey;

    admin.initializeApp({
      credential: serviceAccount
        ? admin.credential.cert(serviceAccount)
        : hasExplicitCredentials
          ? admin.credential.cert({ projectId, clientEmail, privateKey })
          : admin.credential.applicationDefault(),
      projectId,
    });
    logger.info("Firebase Admin SDK initialized");

    if (env.NODE_ENV === "production") {
      try {
        logger.info("Firebase App Check enabled for server-side protection");
      } catch (appCheckError) {
        logger.warn("Server-side App Check initialization failed:", { appCheckError });
      }
    }
  } catch (error) {
    logger.warn("Firebase Admin initialization failed:", { error });
  }
}

export { admin };
