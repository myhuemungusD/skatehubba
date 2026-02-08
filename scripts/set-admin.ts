/**
 * God Mode Script - Bootstrap Admin Access
 *
 * Run this script locally to grant yourself initial admin privileges.
 * NEVER hardcode admin emails in deployed functions.
 *
 * Usage: npx tsx scripts/set-admin.ts
 *    or: ADMIN_EMAIL=you@example.com npx tsx scripts/set-admin.ts
 *
 * Prerequisites:
 * 1. Download serviceAccountKey.json from Firebase Console
 *    (Project Settings → Service Accounts → Generate New Private Key)
 * 2. Place it in the project root (it's gitignored)
 * 3. Ensure DATABASE_URL is set (Postgres connection)
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq } from "drizzle-orm";
import { users } from "../packages/shared/schema";

const { Pool } = pg;

// 1. Initialize Firebase Admin with your Service Account
const serviceAccountPath = path.resolve(process.cwd(), "serviceAccountKey.json");

try {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error("File not found");
  }

  const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf-8");
  const serviceAccount = JSON.parse(serviceAccountJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch {
  console.error("❌ ERROR: Could not find or parse serviceAccountKey.json");
  console.error("   Please download it from Firebase Console:");
  console.error("   Project Settings → Service Accounts → Generate New Private Key");
  console.error("   Then place it in the project root directory.");
  process.exit(1);
}

// 2. Configuration - require ADMIN_EMAIL to be set
const TARGET_EMAIL = process.env.ADMIN_EMAIL;

if (!TARGET_EMAIL) {
  console.error("❌ ERROR: ADMIN_EMAIL environment variable is not set.");
  console.error("   Please set ADMIN_EMAIL to the email of the user to grant admin access.");
  process.exit(1);
}

const ROLES: string[] = ["admin", "verified_pro"];

// Initialize Postgres connection
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR: DATABASE_URL environment variable is not set.");
  console.error("   Please set DATABASE_URL to connect to PostgreSQL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Simple email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  operation: string = 'operation'
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.warn(`⚠️  ${operation} failed (attempt ${attempt + 1}/${maxRetries})`);
        console.warn(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`${operation} failed after ${maxRetries} attempts: ${lastError!.message}`);
}

/**
 * Rollback Firebase custom claims
 */
async function rollbackFirebaseClaims(uid: string): Promise<void> {
  try {
    console.log('🔄 Rolling back Firebase custom claims...');
    await admin.auth().setCustomUserClaims(uid, null);
    console.log('✅ Firebase claims rolled back successfully');
  } catch (error) {
    console.error('⚠️  Failed to rollback Firebase claims:', (error as Error).message);
    console.error('   You may need to manually remove claims for user:', uid);
  }
}

async function grantGodMode() {
  let userUid: string | null = null;
  let claimsSet = false;

  try {
    // Validate email format
    if (!isValidEmail(TARGET_EMAIL)) {
      console.error(`❌ ERROR: Invalid email format: ${TARGET_EMAIL}`);
      console.error('   Expected format: user@example.com');
      process.exit(1);
    }

    console.log(`🔍 Looking up user: ${TARGET_EMAIL}`);

    // 3. Find the user in Firebase Auth with retry
    const user = await retryWithBackoff(
      () => admin.auth().getUserByEmail(TARGET_EMAIL),
      3,
      'Firebase user lookup'
    );

    userUid = user.uid;
    console.log(`   Found user: ${user.email} (${user.uid})`);

    // 4. Set Custom Claims (roles live in Firebase, not Postgres) with retry
    console.log(`🔐 Setting custom claims...`);
    await retryWithBackoff(
      () => admin.auth().setCustomUserClaims(user.uid, { roles: ROLES }),
      3,
      'Setting Firebase custom claims'
    );
    claimsSet = true;
    console.log(`   ✅ Custom claims set: [${ROLES.join(", ")}]`);

    // 5. Ensure user exists in PostgreSQL (single source of truth for profile data)
    console.log(`💾 Checking PostgreSQL...`);

    const existing = await retryWithBackoff(
      async () => {
        const result = await db.select().from(users).where(eq(users.id, user.uid)).limit(1);
        return result;
      },
      3,
      'PostgreSQL user lookup'
    );

    if (existing.length === 0) {
      console.log(`   Creating user record in PostgreSQL...`);
      try {
        await retryWithBackoff(
          () => db.insert(users).values({
            id: user.uid,
            email: user.email || TARGET_EMAIL,
          }),
          3,
          'PostgreSQL user insert'
        );
        console.log("   ✅ Created user record in PostgreSQL");
      } catch (dbError) {
        // If PostgreSQL fails, rollback Firebase claims
        console.error(`❌ Failed to create user in PostgreSQL: ${(dbError as Error).message}`);
        await rollbackFirebaseClaims(user.uid);
        throw dbError;
      }
    } else {
      console.log("   ✅ User already exists in PostgreSQL");
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`✅ SUCCESS: Granted [${ROLES.join(", ")}] to ${user.email}`);
    console.log(`🆔 User ID: ${user.uid}`);
    console.log("═══════════════════════════════════════════════════════");
    console.log("");
    console.log("⚠️  IMPORTANT: You must log out and log back in for changes to take effect.");
    console.log("");

    await cleanupAndExit(0);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };

    console.log("");
    console.log("═══════════════════════════════════════════════════════");

    if (firebaseError.code === "auth/user-not-found") {
      console.error(`❌ ERROR: No user found with email: ${TARGET_EMAIL}`);
      console.error("   Make sure the user has signed up first.");
    } else if (firebaseError.message?.includes('serviceAccountKey.json')) {
      console.error("❌ ERROR: Firebase initialization failed");
      console.error("   Ensure serviceAccountKey.json is valid and properly formatted.");
    } else if (firebaseError.message?.includes('PostgreSQL') || firebaseError.message?.includes('database')) {
      console.error(`❌ ERROR: Database operation failed`);
      console.error(`   ${firebaseError.message}`);
      console.error("");
      console.error("💡 Recovery suggestions:");
      console.error("   1. Verify DATABASE_URL is correct");
      console.error("   2. Ensure PostgreSQL server is running");
      console.error("   3. Check database permissions");
      console.error("   4. Verify the 'users' table exists");

      // If claims were set but DB failed, they've already been rolled back
      if (claimsSet && userUid) {
        console.error("");
        console.error("   Note: Firebase claims have been rolled back.");
      }
    } else {
      console.error("❌ ERROR:", firebaseError.message || error);
    }

    console.log("═══════════════════════════════════════════════════════");
    console.log("");

    await cleanupAndExit(1);
  }
}

/**
 * Clean up resources and exit
 */
async function cleanupAndExit(code: number): Promise<void> {
  try {
    await pool.end();
  } catch (error) {
    console.error('⚠️  Warning: Failed to close database pool:', (error as Error).message);
  }

  process.exit(code);
}

grantGodMode();
