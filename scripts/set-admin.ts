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

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { users } from '../shared/schema';

const { Pool } = pg;

// 1. Initialize Firebase Admin with your Service Account
const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

try {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error('File not found');
  }
  
  const serviceAccountJson = fs.readFileSync(serviceAccountPath, 'utf-8');
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('❌ ERROR: Could not find or parse serviceAccountKey.json');
  console.error('   Please download it from Firebase Console:');
  console.error('   Project Settings → Service Accounts → Generate New Private Key');
  console.error('   Then place it in the project root directory.');
  process.exit(1);
}

// 2. Configuration - require ADMIN_EMAIL to be set
const TARGET_EMAIL = process.env.ADMIN_EMAIL;

if (!TARGET_EMAIL) {
  console.error('❌ ERROR: ADMIN_EMAIL environment variable is not set.');
  console.error('   Please set ADMIN_EMAIL to the email of the user to grant admin access.');
  process.exit(1);
}
const ROLES: string[] = ['admin', 'verified_pro'];

// Initialize Postgres connection
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set.');
  console.error('   Please set DATABASE_URL to connect to PostgreSQL.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Simple email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function grantGodMode() {
  try {
    // Validate email format
    if (!isValidEmail(TARGET_EMAIL)) {
      console.error(`❌ ERROR: Invalid email format: ${TARGET_EMAIL}`);
      process.exit(1);
    }
    
    console.log(`🔍 Looking up user: ${TARGET_EMAIL}`);
    
    // 3. Find the user
    const user = await admin.auth().getUserByEmail(TARGET_EMAIL);
    
    // 4. Set Custom Claims (The "Magic" part)
    // We use a 'roles' array to allow multiple hats (e.g., Admin AND Pro)
    await admin.auth().setCustomUserClaims(user.uid, {
      roles: ROLES
    });

    // 5. Ensure user exists in PostgreSQL (single source of truth for profile data)
    // Note: Roles are stored in Firebase Custom Claims, not in the database
    const existingUsers = await db.select()
      .from(users)
      .where(eq(users.id, user.uid))
      .limit(1);

    if (existingUsers.length === 0) {
      // Create user record if doesn't exist
      await db.insert(users).values({
        id: user.uid,
        email: user.email || TARGET_EMAIL,
      });
      console.log('✅ Created user record in PostgreSQL');
    } else {
      console.log('✅ User already exists in PostgreSQL');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ SUCCESS: Granted [${ROLES.join(', ')}] to ${user.email}`);
    console.log(`🆔 User ID: ${user.uid}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('⚠️  IMPORTANT: You must log out and log back in for changes to take effect.');
    console.log('');
    
    // Cleanup
    await pool.end();
    process.exit(0);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    
    if (firebaseError.code === 'auth/user-not-found') {
      console.error(`❌ ERROR: No user found with email: ${TARGET_EMAIL}`);
      console.error('   Make sure the user has signed up first.');
    } else {
      console.error("❌ ERROR:", firebaseError.message || error);
    }
    process.exit(1);
  }
}

grantGodMode();
