import { create } from "zustand";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { logger } from "../lib/logger";

export interface UserPresence {
  userId: string;
  userName: string;
  status: "online" | "away" | "offline";
  lastSeen: number;
  currentPage?: string;
}

interface PresenceState {
  onlineUsers: UserPresence[];
  isConnected: boolean;

  // Actions
  setUserOnline: (userId: string, userName: string, currentPage?: string) => Promise<void>;
  setUserOffline: (userId: string) => Promise<void>;
  updateUserPage: (userId: string, currentPage: string) => Promise<void>;
  listenToPresence: () => () => void;
  disconnect: () => void;
  getOnlineCount: () => number;
}

let presenceUnsubscribe: (() => void) | null = null;

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: [],
  isConnected: false,

  setUserOnline: async (userId: string, userName: string, currentPage?: string) => {
    try {
      const userRef = doc(db, "user_presence", userId);
      await setDoc(userRef, {
        userId,
        userName,
        status: "online",
        lastSeen: Timestamp.now(),
        currentPage: currentPage || "/",
      });
      set({ isConnected: true });
    } catch (error) {
      logger.error("Error setting user online:", error);
    }
  },

  setUserOffline: async (userId: string) => {
    try {
      const userRef = doc(db, "user_presence", userId);
      await updateDoc(userRef, {
        status: "offline",
        lastSeen: Timestamp.now(),
      });
    } catch (error) {
      logger.error("Error setting user offline:", error);
    }
  },

  updateUserPage: async (userId: string, currentPage: string) => {
    try {
      const userRef = doc(db, "user_presence", userId);
      await updateDoc(userRef, {
        currentPage,
        lastSeen: Timestamp.now(),
      });
    } catch (error) {
      logger.error("Error updating user page:", error);
    }
  },

  listenToPresence: () => {
    // Clean up any existing listener before creating a new one
    if (presenceUnsubscribe) {
      presenceUnsubscribe();
      presenceUnsubscribe = null;
    }

    const q = query(collection(db, "user_presence"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        const onlineUsers = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              userId: data.userId,
              userName: data.userName,
              status: data.status,
              lastSeen: data.lastSeen?.toMillis() || 0,
              currentPage: data.currentPage,
            };
          })
          .filter((user) => {
            return user.lastSeen > fiveMinutesAgo && user.status === "online";
          });

        set({ onlineUsers, isConnected: true });
      },
      (error) => {
        logger.error("Error listening to presence:", error);
        set({ isConnected: false });
      }
    );

    presenceUnsubscribe = unsubscribe;
    return unsubscribe;
  },

  disconnect: () => {
    if (presenceUnsubscribe) {
      presenceUnsubscribe();
      presenceUnsubscribe = null;
    }
    set({ isConnected: false, onlineUsers: [] });
  },

  getOnlineCount: () => {
    return get().onlineUsers.length;
  },
}));
