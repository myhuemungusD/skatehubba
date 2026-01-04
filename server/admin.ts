import admin from "firebase-admin";
import { env } from './config/env';
import logger from './logger';

if (!admin.apps.length) {
  try {
    const serviceAccount = env.FIREBASE_ADMIN_KEY ? JSON.parse(env.FIREBASE_ADMIN_KEY) : null;
    
    admin.initializeApp({
      credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
      projectId: env.VITE_FIREBASE_PROJECT_ID,
    });
    logger.info('Firebase Admin SDK initialized');

    if (env.NODE_ENV === 'production') {
      try {
        logger.info('Firebase App Check enabled for server-side protection');
      } catch (appCheckError) {
        logger.warn('Server-side App Check initialization failed:', { appCheckError });
      }
    }
  } catch (error) {
    logger.warn('Firebase Admin initialization failed:', { error });
  }
}

export { admin };
