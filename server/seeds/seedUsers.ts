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
 *   DRY_RUN=1 pnpm seed:users    # preview without writing
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
import { eq, inArray } from "drizzle-orm";
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
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20);
    if (handle.length >= 3) return handle;
  }

  // Fall back to email local part
  const localPart = email.split("@")[0];
  const handle = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  if (handle.length >= 3) return handle;

  // Last resort: use uid prefix (strip non-alphanumeric for consistency)
  return uid
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Parse display name into first/last
// ---------------------------------------------------------------------------
function parseName(displayName: string | undefined): {
  firstName: string;
  lastName: string | null;
} {
  if (!displayName) return { firstName: "Skater", lastName: null };
  const parts = displayName.trim().split(/\s+/);
  return {
    firstName: parts[0] || "Skater",
    lastName: parts.slice(1).join(" ") || null,
  };
}

// Sentinel value for Firebase-only users who have no local password.
// Auth code (service.ts, reauth.ts) checks for this to skip password verification.
const FIREBASE_PASSWORD_SENTINEL = "firebase-auth-user";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dryRun = !!process.env.DRY_RUN;
  if (dryRun) {
    console.log("*** DRY RUN — no data will be written ***\n");
  }

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

    // 5. Bulk-fetch existing users to avoid N+1 queries
    const firebaseUids = allFirebaseUsers.map((u) => u.uid).filter(Boolean);
    const emails = allFirebaseUsers
      .map((u) => u.email?.toLowerCase())
      .filter((e): e is string => !!e);

    const existingByUid = new Set(
      (
        await db
          .select({ firebaseUid: schema.customUsers.firebaseUid })
          .from(schema.customUsers)
          .where(inArray(schema.customUsers.firebaseUid, firebaseUids))
      ).map((r) => r.firebaseUid)
    );

    const existingByEmail = new Set(
      (
        await db
          .select({ email: schema.customUsers.email })
          .from(schema.customUsers)
          .where(inArray(schema.customUsers.email, emails))
      ).map((r) => r.email)
    );

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

      if (existingByUid.has(firebaseUid)) {
        console.log(`  ⊘ Skipping ${email} — already in database`);
        skipped++;
        continue;
      }

      if (existingByEmail.has(email.toLowerCase())) {
        console.log(`  ⊘ Skipping ${email} — email already in database`);
        skipped++;
        continue;
      }

      const { firstName, lastName } = parseName(fbUser.displayName);
      const baseHandle = generateHandle(email, fbUser.displayName, firebaseUid);

      if (dryRun) {
        console.log(`  [dry-run] Would seed ${email} → @${baseHandle}`);
        inserted++;
        continue;
      }

      try {
        // Use a transaction so all 3 inserts succeed or none do
        const finalHandle = await db.transaction(async (tx) => {
          await tx.insert(schema.customUsers).values({
            email: email.toLowerCase(),
            passwordHash: FIREBASE_PASSWORD_SENTINEL,
            firstName,
            lastName,
            firebaseUid,
            isEmailVerified: fbUser.emailVerified ?? false,
            isActive: true,
            accountTier: "free",
          });

          // Ensure handle uniqueness — retry with numeric suffixes if taken
          let handle = baseHandle;
          let handleIsUnique = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const existingHandle = await tx
              .select({ id: schema.usernames.id })
              .from(schema.usernames)
              .where(eq(schema.usernames.username, handle))
              .limit(1);

            if (existingHandle.length === 0) {
              handleIsUnique = true;
              break;
            }

            const suffix = String(attempt + 1);
            handle = `${baseHandle.slice(0, 20 - suffix.length)}${suffix}`;
          }

          if (!handleIsUnique) {
            throw new Error(`Could not find unique handle for base "${baseHandle}"`);
          }

          await tx.insert(schema.usernames).values({
            uid: firebaseUid,
            username: handle,
          });

          await tx.insert(schema.userProfiles).values({
            id: firebaseUid,
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

          return handle;
        });

        console.log(`  ✓ Seeded ${email} → @${finalHandle}`);
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
    if (dryRun) console.log("(dry run — no data was written)");
    console.log("========================================");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
