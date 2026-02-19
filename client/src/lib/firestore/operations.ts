import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDoc,
  getDocs,
  query,
  QueryConstraint,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// NOTE: usernames and spots are exclusively in PostgreSQL (Neon). Do not query them from Firestore.
//
// `users` is a display document, NOT the authoritative user record (that is PostgreSQL).
// Client creates { uid, displayName, createdAt, updatedAt } on sign-up (authStore.ts).
// Server Cloud Functions add roles/xp/isPro via Admin SDK.
// For authoritative profile data use the Express API: GET /api/profile/me
// For spots use: GET /api/spots
export const firestoreCollections = {
  users: "users", // display doc — see docs/architecture/FIRESTORE.md
  chatMessages: "chat_messages",
  gameSessions: "game_sessions",
  notifications: "notifications",
  activeCheckins: "active_checkins",
  challengeVotes: "challenge_votes",
  leaderboardLive: "leaderboard_live",
} as const;

export type FirestoreCollection = (typeof firestoreCollections)[keyof typeof firestoreCollections];

export async function createDocument<T extends Record<string, unknown>>(
  collectionPath: FirestoreCollection,
  data: T,
  customId?: string
): Promise<string> {
  const collectionRef = collection(db, collectionPath);

  if (customId) {
    const docRef = doc(collectionRef, customId);
    await setDoc(docRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    return customId;
  } else {
    const docRef = await addDoc(collectionRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }
}

export async function updateDocument(
  collectionPath: FirestoreCollection,
  documentId: string,
  data: Record<string, unknown>,
  options: { addTimestamp?: boolean } = { addTimestamp: false }
): Promise<void> {
  const docRef = doc(db, collectionPath, documentId);
  const updateData = options.addTimestamp ? { ...data, updatedAt: serverTimestamp() } : data;
  await updateDoc(docRef, updateData);
}

export async function deleteDocument(
  collectionPath: FirestoreCollection,
  documentId: string
): Promise<void> {
  const docRef = doc(db, collectionPath, documentId);
  await deleteDoc(docRef);
}

export async function getDocument<T = Record<string, unknown>>(
  collectionPath: FirestoreCollection,
  documentId: string
): Promise<T | null> {
  const docRef = doc(db, collectionPath, documentId);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return {
      id: snapshot.id,
      ...snapshot.data(),
    } as T;
  }

  return null;
}

export async function queryDocuments<T = Record<string, unknown>>(
  collectionPath: FirestoreCollection,
  constraints: QueryConstraint[]
): Promise<T[]> {
  const collectionRef = collection(db, collectionPath);
  const q = query(collectionRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as T[];
}

export { serverTimestamp, Timestamp };
