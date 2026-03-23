import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let app: App;

if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else {
    // Graceful fallback for local dev without Firebase credentials
    app = initializeApp({ projectId: projectId || "skatehubba-dev" });
  }
} else {
  app = getApps()[0];
}

export const admin = { auth: (): Auth => getAuth(app) };
