/**
 * User Profile Service
 * 
 * Firestore operations for user profiles.
 * Handles creating, reading, and updating user profile documents.
 * 
 * @module lib/firebase/profile.service
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db as getDb } from './config';
import { UserProfile, CreateProfileInput, AuthUser } from './auth.types';

// ============================================================================
// Constants
// ============================================================================

const USERS_COLLECTION = 'users';

// ============================================================================
// Profile Operations
// ============================================================================

/**
 * Get a user profile by UID
 * 
 * @param uid - User's unique identifier
 * @returns User profile or null if not found
 */
export async function getProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  
  // Retry logic for Firestore permission issues (auth token may not be ready)
  const maxRetries = 3;
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const docRef = doc(db, USERS_COLLECTION, uid);
      const snapshot = await getDoc(docRef);
      
      if (!snapshot.exists()) {
        return null;
      }
      
      const data = snapshot.data();
      return transformProfile(uid, data);
    } catch (error: any) {
      lastError = error;
      console.error(`[ProfileService] Attempt ${attempt}/${maxRetries} failed:`, error?.code || error);
      
      // If it's a permission error and we have retries left, wait and retry
      if (error?.code === 'permission-denied' && attempt < maxRetries) {
        console.log(`[ProfileService] Waiting for auth token to propagate...`);
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        continue;
      }
      
      throw error;
    }
  }
  
  console.error('[ProfileService] All retries failed:', lastError);
  throw new Error('Failed to load user profile.');
}

/**
 * Create a new user profile
 * 
 * @param uid - User's unique identifier
 * @param input - Profile data
 * @returns Created user profile
 */
export async function createProfile(
  uid: string,
  input: CreateProfileInput
): Promise<UserProfile> {
  const db = getDb();
  
  const displayName = input.displayName || 
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
    input.email.split('@')[0];
  
  const profileData = {
    uid,
    email: input.email,
    displayName,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    photoURL: input.photoURL || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  // Retry logic for Firestore permission issues (auth token may not be ready)
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const docRef = doc(db, USERS_COLLECTION, uid);
      await setDoc(docRef, profileData);
      
      return {
        ...profileData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error: any) {
      console.error(`[ProfileService] Create attempt ${attempt}/${maxRetries} failed:`, error?.code || error);
      
      // If it's a permission error and we have retries left, wait and retry
      if (error?.code === 'permission-denied' && attempt < maxRetries) {
        console.log(`[ProfileService] Waiting for auth token to propagate...`);
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        continue;
      }
      
      throw new Error('Failed to create user profile.');
    }
  }
  
  throw new Error('Failed to create user profile.');
}

/**
 * Update an existing user profile
 * 
 * @param uid - User's unique identifier
 * @param updates - Fields to update
 * @returns Updated user profile
 */
export async function updateProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'firstName' | 'lastName' | 'photoURL'>>
): Promise<void> {
  const db = getDb();
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[ProfileService] Failed to update profile:', error);
    throw new Error('Failed to update user profile.');
  }
}

/**
 * Get or create a user profile
 * Creates profile if it doesn't exist (useful for OAuth flows)
 * 
 * @param user - Authenticated user
 * @param additionalData - Optional additional profile data
 * @returns User profile (existing or newly created)
 */
export async function getOrCreateProfile(
  user: AuthUser,
  additionalData?: { firstName?: string; lastName?: string }
): Promise<UserProfile> {
  // Try to get existing profile
  const existingProfile = await getProfile(user.uid);
  
  if (existingProfile) {
    return existingProfile;
  }
  
  // Parse display name for first/last name
  const nameParts = (user.displayName || '').split(' ');
  const firstName = additionalData?.firstName || nameParts[0] || null;
  const lastName = additionalData?.lastName || nameParts.slice(1).join(' ') || null;
  
  // Create new profile
  return createProfile(user.uid, {
    email: user.email || '',
    displayName: user.displayName || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    photoURL: user.photoURL,
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Transform Firestore document data to UserProfile
 */
function transformProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    email: data.email as string,
    displayName: data.displayName as string,
    firstName: (data.firstName as string) || null,
    lastName: (data.lastName as string) || null,
    photoURL: (data.photoURL as string) || null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Convert Firestore Timestamp to Date
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as Timestamp).toDate();
  }
  return new Date();
}
