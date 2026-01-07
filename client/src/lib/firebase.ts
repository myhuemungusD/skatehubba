import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { env } from '../config/env';
import { logger } from './logger';

if (typeof window !== 'undefined') {
  window.fetch = window.fetch.bind(window);
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForDev",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID || 'skatehubba-dev'}.firebaseapp.com`,
  projectId: env.VITE_FIREBASE_PROJECT_ID || "skatehubba-dev",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID || 'skatehubba-dev'}.appspot.com`,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

let app: any;
let auth: any;
let db: any;
const analytics: any = null;

const isFirebaseConfigured = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_API_KEY !== 'undefined' && env.VITE_FIREBASE_API_KEY.length > 10);

try {
  if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
    logger.info('[Firebase] Initialized with config');
  } else {
    throw new Error("Missing Firebase API Key");
  }
} catch (error) {
  logger.warn('[Firebase] Initialization skipped or failed, using mock mode');
  app = { 
    name: '[DEFAULT]',
    options: firebaseConfig
  } as any;
  
  const mockErrorFactory = {
    create: (code: string) => {
      const err = new Error(code);
      (err as any).code = code;
      return err;
    }
  };

  auth = { 
    name: '[DEFAULT]',
    _isMock: true,
    _errorFactory: mockErrorFactory,
    config: {
       _errorFactory: mockErrorFactory
    },
    onAuthStateChanged: (callback: any) => {
      if (typeof callback === 'function') {
        // Initialize with null first
        callback(null);
        
        // Listen for internal state changes
        const eventHandler = (event: any) => {
          callback(event.detail);
        };
        window.addEventListener('firebase-mock-auth-changed', eventHandler);
        
        // Check if there's already a mock user session in memory
        const storedUser = localStorage.getItem('firebase-mock-user');
        if (storedUser) {
          try {
            const user = JSON.parse(storedUser);
            // Re-hydrate getIdToken method
            user.getIdToken = async () => 'mock-guest-token';
            setTimeout(() => callback(user), 0);
          } catch (e) {
            localStorage.removeItem('firebase-mock-user');
          }
        }

        return () => window.removeEventListener('firebase-mock-auth-changed', eventHandler);
      }
      return () => {};
    },
    signOut: async () => {
      localStorage.removeItem('firebase-mock-user');
      window.dispatchEvent(new CustomEvent('firebase-mock-auth-changed', { detail: null }));
    },
    signInAnonymously: async () => {
      const mockUser = {
        uid: 'guest-' + Math.random().toString(36).substr(2, 9),
        isAnonymous: true,
        displayName: 'Guest Skater',
        email: 'guest@skatehubba.com',
        emailVerified: true, 
        getIdToken: async () => 'mock-guest-token'
      };
      
      localStorage.setItem('firebase-mock-user', JSON.stringify(mockUser));
      window.dispatchEvent(new CustomEvent('firebase-mock-auth-changed', { detail: mockUser }));
      
      return { user: mockUser };
    },
    signInWithPopup: async () => {
      const mockUser = {
        uid: 'google-' + Math.random().toString(36).substr(2, 9),
        isAnonymous: false,
        displayName: 'Google Skater',
        email: 'google@skatehubba.com',
        emailVerified: true,
        getIdToken: async () => 'mock-google-token'
      };
      localStorage.setItem('firebase-mock-user', JSON.stringify(mockUser));
      window.dispatchEvent(new CustomEvent('firebase-mock-auth-changed', { detail: mockUser }));
      return { user: mockUser };
    },
    signInWithRedirect: async () => {
      const mockUser = {
        uid: 'google-' + Math.random().toString(36).substr(2, 9),
        isAnonymous: false,
        displayName: 'Google Skater',
        email: 'google@skatehubba.com',
        emailVerified: true,
        getIdToken: async () => 'mock-google-token'
      };
      localStorage.setItem('firebase-mock-user', JSON.stringify(mockUser));
      window.dispatchEvent(new CustomEvent('firebase-mock-auth-changed', { detail: mockUser }));
    },
    getRedirectResult: async () => {
      const stored = localStorage.getItem('firebase-mock-user');
      if (stored) {
        const user = JSON.parse(stored);
        user.getIdToken = async () => 'mock-token';
        return { user };
      }
      return null;
    },
    setPersistence: async () => {},
    _getProvider: (_name: string) => ({
      getImmediate: () => ({
        _errorFactory: mockErrorFactory,
        _errorFactoryInstance: mockErrorFactory
      }),
      getComponent: () => ({
        _errorFactory: mockErrorFactory
      })
    })
  } as any;
  (auth as any)._errorFactory = mockErrorFactory;
  db = {} as any;
}

export { app, auth, db, analytics };
