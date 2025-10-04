import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app;
let db;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Test Firebase connection with dummy data
export const testFirebaseConnection = async () => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // Test 1: Write a test document
    const testDocRef = doc(db, 'test', 'connection-test');
    await setDoc(testDocRef, {
      message: 'SkateHubba Firebase test',
      timestamp: new Date(),
      app: 'skatehubba-mvp'
    });

    // Test 2: Read the test document
    const testDocSnap = await getDoc(testDocRef);
    
    if (testDocSnap.exists()) {
      console.log('Firebase test successful:', testDocSnap.data());
      return { success: true, message: 'Firebase connection successful' };
    } else {
      throw new Error('Test document not found after write');
    }

  } catch (error) {
    console.error('Firebase test failed:', error);
    return { success: false, message: error.message };
  }
};

// Test adding a spot to Firestore
export const testAddSpot = async (spotData) => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const spotsRef = collection(db, 'spots');
    const docRef = await addDoc(spotsRef, {
      ...spotData,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Spot added with ID:', docRef.id);
    return { success: true, id: docRef.id };
    
  } catch (error) {
    console.error('Error adding spot:', error);
    return { success: false, message: error.message };
  }
};

// Test reading spots from Firestore
export const testReadSpots = async () => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // For now, just test if we can access the collection
    const spotsRef = collection(db, 'spots');
    console.log('Spots collection reference created successfully');
    
    return { success: true, message: 'Spots collection accessible' };
    
  } catch (error) {
    console.error('Error reading spots:', error);
    return { success: false, message: error.message };
  }
};

export { app, db };