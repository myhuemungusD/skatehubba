/* eslint-disable no-console */
/**
 * Seed script that syncs Firebase Auth users into PostgreSQL.
 *
 * Pulls all users from Firebase Auth via the Admin SDK and ensures each one
 * has a corresponding row in `custom_users`, `usernames`, and `user_profiles`.
 *
 * Usage:
 *   pnpm seed:users              # from repo root
 *   npx tsx seeds/seedUsers.ts   # from server/
 *
 * Prerequisites:
 *   1. serviceAccountKey.json in project root (Firebase Console → Service Accounts)
 *   2. DATABASE_URL env var pointing to your Neon PostgreSQL instance
 *
 * Safe to run multiple times — existing users are skipped.
 */

import * as firebaseAdmin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as schema from "../../packages/shared/schema/index";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// ---------------------------------------------------------------------------
// Firebase Admin initialization (mirrors scripts/set-admin.ts)
// ---------------------------------------------------------------------------
function initFirebase(): void {
  const serviceAccountPath = path.resolve(process.cwd(), "serviceAccountKey.json");

  if (!fs.existsSync(serviceAccountPath)) {
    // Fallback: try env vars
    const adminKey = process.env.FIREBASE_ADMIN_KEY;
    if (adminKey) {
      try {
        const serviceAccount = JSON.parse(adminKey);
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialized via FIREBASE_ADMIN_KEY env var");
        return;
      } catch {
        console.error("✗ FIREBASE_ADMIN_KEY contains invalid JSON");
      }
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log("Firebase Admin initialized via individual env vars");
      return;
    }

    console.error("✗ Could not find serviceAccountKey.json or Firebase env vars.");
    console.error("  Download it from Firebase Console:");
    console.error("  Project Settings → Service Accounts → Generate New Private Key");
    console.error("  Place it in the project root directory.");
    process.exit(1);
  }

  const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf-8");
  const serviceAccount = JSON.parse(serviceAccountJson);
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin initialized via serviceAccountKey.json");
}

// ---------------------------------------------------------------------------
// Generate a username/handle from email or displayName
// ---------------------------------------------------------------------------
function generateHandle(email: string, displayName: string | undefined, uid: string): string {
  // Try displayName first: lowercase, remove spaces/special chars, max 20 chars
  if (displayName) {
    const handle = displayName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
    if (handle.length >= 3) return handle;
  }

  // Fall back to email local part
  const localPart = email.split("@")[0];
  const handle = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  if (handle.length >= 3) return handle;

  // Last resort: use uid prefix
  return uid.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Parse display name into first/last
// ---------------------------------------------------------------------------
function parseName(displayName: string | undefined): { firstName: string; lastName: string } {
  if (!displayName) return { firstName: "Skater", lastName: "" };
  const parts = displayName.trim().split(/\s+/);
  return {
    firstName: parts[0] || "Skater",
    lastName: parts.slice(1).join(" ") || "",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // 1. Validate DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("dummy")) {
    console.error("✗ DATABASE_URL not set. Export it before running this script.");
    console.error(
      "  Example: DATABASE_URL=postgresql://user:pass@host/db npx tsx seeds/seedUsers.ts"
    );
    process.exit(1);
  }

  // 2. Initialize Firebase
  initFirebase();

  // 3. Connect to database
  console.log("Connecting to database...");
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  try {
    const db = drizzle(pool, { schema });

    // 4. List all Firebase Auth users
    console.log("Fetching users from Firebase Auth...\n");
    const allFirebaseUsers: firebaseAdmin.auth.UserRecord[] = [];
    let nextPageToken: string | undefined;

    do {
      const listResult = await firebaseAdmin.auth().listUsers(1000, nextPageToken);
      allFirebaseUsers.push(...listResult.users);
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    console.log(`Found ${allFirebaseUsers.length} users in Firebase Auth.\n`);

    if (allFirebaseUsers.length === 0) {
      console.log("No users to seed.");
      return;
    }

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const fbUser of allFirebaseUsers) {
      const firebaseUid = fbUser.uid;
      const email = fbUser.email;

      if (!email) {
        console.log(`  ⊘ Skipping user ${firebaseUid} — no email`);
        skipped++;
        continue;
      }

      // Check if user already exists in PostgreSQL
      const existing = await db
        .select({ id: schema.customUsers.id })
        .from(schema.customUsers)
        .where(eq(schema.customUsers.firebaseUid, firebaseUid))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ⊘ Skipping ${email} — already in database`);
        skipped++;
        continue;
      }

      // Also check by email in case they registered without firebaseUid link
      const existingByEmail = await db
        .select({ id: schema.customUsers.id })
        .from(schema.customUsers)
        .where(eq(schema.customUsers.email, email.toLowerCase()))
        .limit(1);

      if (existingByEmail.length > 0) {
        console.log(`  ⊘ Skipping ${email} — email already in database`);
        skipped++;
        continue;
      }

      const { firstName, lastName } = parseName(fbUser.displayName);
      let handle = generateHandle(email, fbUser.displayName, firebaseUid);

      try {
        // Use a transaction so all 3 inserts succeed or none do
        await db.transaction(async (tx) => {
          // Insert into customUsers
          const [newUser] = await tx
            .insert(schema.customUsers)
            .values({
              email: email.toLowerCase(),
              passwordHash: "firebase-auth-user",
              firstName,
              lastName: lastName || null,
              firebaseUid,
              isEmailVerified: fbUser.emailVerified ?? false,
              isActive: true,
              accountTier: "free",
            })
            .returning({ id: schema.customUsers.id });

          // Ensure handle uniqueness — retry with numeric suffixes if taken
          const baseHandle = handle;
          let handleAvailable = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            const existingHandle = await tx
              .select({ id: schema.usernames.id })
              .from(schema.usernames)
              .where(eq(schema.usernames.username, handle))
              .limit(1);

            if (existingHandle.length === 0) {
              handleAvailable = true;
              break;
            }

            handle = `${baseHandle.slice(0, 15)}${attempt}${Math.floor(Math.random() * 999)
              .toString()
              .padStart(3, "0")}`;
          }

          if (!handleAvailable) {
            throw new Error(`could not find unique handle after 10 attempts (base: ${baseHandle})`);
          }

          // Insert into usernames
          await tx.insert(schema.usernames).values({
            uid: newUser.id,
            username: handle,
          });

          // Insert into userProfiles
          await tx.insert(schema.userProfiles).values({
            id: newUser.id,
            handle,
            displayName: fbUser.displayName || firstName,
            bio: null,
            photoURL: fbUser.photoURL || null,
            stance: "regular",
            homeSpot: null,
            wins: 0,
            losses: 0,
            xp: 0,
          });
        });

        console.log(`  ✓ Seeded ${email} → @${handle}`);
        inserted++;
      } catch (error) {
        errors++;
        console.warn(
          `  ⚠ Failed to seed ${email}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    console.log("\n========================================");
    console.log(`Done! Inserted: ${inserted} | Skipped: ${skipped} | Errors: ${errors}`);
    console.log("========================================");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
