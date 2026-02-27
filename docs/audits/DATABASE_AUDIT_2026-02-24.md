# Database Layer Production Audit

> **Date:** 2026-02-24
> **Scope:** Full audit of PostgreSQL/Firestore hybrid architecture — boundary violations, sync gaps, security rules, schema consistency, dual-write error handling, environment isolation, and orphaned collections
> **Severity scale:** CRITICAL > HIGH > MEDIUM > LOW

---

## Executive Summary

Seven parallel audits across the database layer surfaced **30 distinct findings**: 9 critical, 9 high, 10 medium, 2 low. The PostgreSQL layer is solid — proper indexes, transactions, connection pooling, row-level locking, no N+1 patterns. The problems concentrate in three areas:

1. **Firestore projection sync is largely unimplemented** — 4 of 5 documented projections have no sync code
2. **Security rules and client code are out of sync** — 3 collection path mismatches cause runtime failures
3. **Remote S.K.A.T.E. and commerce bypass the stated architecture** — Firestore-only writes with no PostgreSQL backing (already addressed by the consolidation plan, but currently live violations)

---

## CRITICAL Findings (Block deployment)

### C1. Collection Path Mismatch: `user_presence` vs `presence`

**Files:** `firestore.rules:143` / `client/src/store/usePresenceStore.ts:40,56,68,79`

Firestore rules define `match /presence/{userId}` but the client writes to `"user_presence"`. All presence operations (online, offline, page updates, listener) fail with permission-denied at runtime.

**Fix:** Change client collection name from `"user_presence"` to `"presence"`.

---

### C2. Chat Messages Missing Required `role` Field

**Files:** `firestore.rules:164-168` / `client/src/store/useChatStore.ts:46-52`

Rules require `hasRequiredFields(['userId', 'message', 'role', 'createdAt'])` with `role == 'user'`. Client sends `{ userId, userName, message, timestamp, isAI }` — no `role` field. Every chat message write fails at runtime.

**Fix:** Add `role: 'user'` and rename `timestamp` to `createdAt` in client chat write payload.

---

### C3. Undeclared Collections: `profiles` and `tricks`

**Files:** `client/src/lib/firebase/profile.service.ts:14,50` / `client/src/components/upload/TrickUpload.tsx:86`

Client reads/writes to `profiles` and `tricks` collections. No matching rules exist in `firestore.rules` — both fall through to the default deny rule (`allow read, write: if false`). All profile reads and trick uploads silently fail.

**Fix:** Either add Firestore rules for these collections or (preferred) remove client-side Firestore references and route through the Express API to PostgreSQL.

---

### C4. Firestore Projection Sync Not Implemented (4 of 5 Collections)

**Files:** DATA_BOUNDARIES.md documents 5 projections; only `users.roles` has any sync code

| Projection                              | Sync Status                                                                                            | Impact                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `users` (xp, level, displayName, isPro) | Only `roles` synced (`functions/src/admin/roles.ts:128`). xp, level, displayName, isPro never written. | Client badges/levels show stale or empty data                        |
| `gameSessions`                          | No sync code exists                                                                                    | Client real-time game subscriptions receive nothing                  |
| `leaderboardLive`                       | No computation job, no sync                                                                            | `useRealtimeLeaderboard.ts` subscribes to empty collection           |
| `notifications`                         | PostgreSQL-only write (`notificationService.ts:222`). No Firestore sync.                               | Real-time notification delivery broken; client falls back to polling |
| `challengeVotes`                        | No sync code exists                                                                                    | Real-time vote tallies broken                                        |

**Fix:** Implement write-through sync for each projection. Priority order: notifications (most user-visible), users.xp/level, leaderboardLive, gameSessions, challengeVotes.

---

### C5. No Reconciliation or Drift Detection

No background job exists to detect or repair inconsistencies between PostgreSQL and Firestore. When a Firestore sync fails after a PostgreSQL write succeeds, data is silently lost with no logging, retry, or alert.

**Fix:** Add a `syncHealth` cron job that samples random records from each projection and compares against PostgreSQL. Log and alert on drift. Implement a dead-letter queue for failed Firestore writes.

---

### C6. Remote S.K.A.T.E. Writes to Firestore Without PostgreSQL Backing

**Files:** `server/routes/remoteSkate.ts:115,205` / `client/src/lib/remoteSkate/remoteSkateService.ts:90-202` / `client/src/lib/remoteSkate/videoUpload.ts:197-214`

All Remote S.K.A.T.E. game data (games, rounds, videos) is written only to Firestore. No PostgreSQL writes occur. This is the core of the consolidation plan (Phase 2) but is currently a live architecture violation.

**Fix:** Addressed by DATABASE_CONSOLIDATION_PLAN.md Phase 2. Until then, acknowledge as accepted risk.

---

### C7. Commerce System Lives Entirely in Firestore

**Files:** `functions/src/commerce/holdAndCreateIntent.ts:343-394` / `functions/src/commerce/stockRelease.ts` / `functions/src/commerce/webhooks/handlers.ts`

Products, holds, orders, stock shards, and webhook deduplication all live in Firestore Cloud Functions with no PostgreSQL involvement. PostgreSQL has separate `products` and `orders` tables that are completely disconnected.

**Fix:** Addressed by DATABASE_CONSOLIDATION_PLAN.md Phase 3. Until then, acknowledge as accepted risk.

---

### C8. Environment Isolation Bypassed in Server Firestore Writes

**Files:** `server/routes/remoteSkate.ts:115,132,205,222`

Server writes to root-level `games` and `rounds` collections (`firestore.collection("games")`). The architecture documents `getEnvPath()` for environment namespacing (`env/prod/games/...`), but the server bypasses it entirely. Staging and production write to the same Firestore collections.

**Fix:** Wrap all server-side Firestore collection references with `getEnvPath()`. Add startup assertion via `assertEnvWiring()` from `@skatehubba/config`.

---

### C9. Missing Firestore Rules for `rate_limits` Collection

**File:** `functions/src/shared/rateLimit.ts:27`

Cloud Functions use a `rate_limits/{uid}` collection for Firestore-based rate limiting via transactions. This collection has **no rules defined** in `firestore.rules`. The Admin SDK bypasses rules (so server-side calls work), but if any client code ever references this collection, it would fail. More importantly, the collection is undocumented and invisible in the rules file — a maintenance hazard.

**Fix:** Add explicit deny rules for `rate_limits` collection in `firestore.rules` to document its existence and ensure no client access: `match /rate_limits/{doc} { allow read, write: if false; }`

---

## HIGH Findings (Fix before next release)

### H1. Client Writes User Doc to Firestore Without Server Control

**File:** `client/src/store/authStore.ts:330-335`

On signup, the client creates a Firestore `users` doc directly (`setDoc`). Per DATA_BOUNDARIES.md, the `users` collection is a projection that should only be written by the server after PostgreSQL.

**Fix:** Move Firestore user doc creation to the server-side registration flow (`POST /api/auth/login` handler). Remove the client `setDoc` call.

---

### H2. Client Writes Profile Updates Directly to Firestore

**File:** `client/src/lib/firebase/profile.service.ts:45-59`

`updateProfile()` writes bio, crewName, avatarUrl directly to a `profiles` Firestore collection. No corresponding PostgreSQL write. This collection isn't even in the Firestore rules (see C3).

**Fix:** Route profile updates through the Express API. Server writes to PostgreSQL first, then syncs to Firestore projection.

---

### H3. XP Sync Between PostgreSQL and Firestore Not Implemented

**File:** `packages/shared/schema/profiles.ts:17` (PostgreSQL xp column exists) / No Firestore sync found

PostgreSQL `userProfiles.xp` is authoritative but never synced to Firestore `users.xp`. Client code and DATA_BOUNDARIES.md both expect this field to exist in Firestore. Level computation (`Math.floor(xp / 500) + 1`) is documented but never executed.

**Fix:** Add write-through in every endpoint that modifies XP (check-in, game completion, trick mastery).

---

### H4. Null Pointer Risk in Firestore Rule Helper Functions

**File:** `firestore.rules:38-48`

`isValidString()` and `isRecentTimestamp()` access `request.resource.data[field]` without checking field existence first. If the field is missing, evaluation produces undefined behavior.

**Fix:** Add `field in request.resource.data &&` guard before accessing the field.

---

### H5. Overly Permissive User Read Access

**File:** `firestore.rules:125`

`allow read: if isAuthenticated()` — any logged-in user can read any other user's document including `isPro`, `role`, `xp`. For a user-facing app, this may be intentional (leaderboard display), but should be explicitly acknowledged.

**Fix:** If intentional, add a code comment documenting the decision. If not, restrict to `isOwner(userId)`.

---

### H6. Commerce Webhook Silent Failure — Restock After Refund

**Files:** `functions/src/commerce/webhooks/handlers.ts:356-367` / `functions/src/commerce/stockRelease.ts:192-214`

`handleChargeRefunded` marks the order as "refunded" in one Firestore transaction, then calls `restockFromConsumedHold` in a separate operation. If the restock fails, the error is caught but **not rethrown** — the function returns success. Inventory is permanently lost with no retry or alert.

Additionally, restock uses non-transactional batch writes — if batch N fails, batches 1..N-1 are already committed (partial restock with no rollback).

**Fix:** Wrap both operations in a single transaction. Add retry with exponential backoff. Alert on restock failure.

---

### H7. Commerce Hold Not Consumed Inside Transaction

**File:** `functions/src/commerce/webhooks/handlers.ts:121-139`

`handlePaymentSucceeded` updates the order to "paid" in a Firestore transaction, then calls `consumeHold()` outside that transaction. If `consumeHold` fails, the order is marked paid but inventory remains stuck in "held" state indefinitely.

**Fix:** Move `consumeHold()` inside the order update transaction.

---

### H8. Schema Field Name Mismatches Across Stores

| Domain        | PostgreSQL Field          | Firestore Field             | Risk                 |
| ------------- | ------------------------- | --------------------------- | -------------------- |
| Commerce      | `price` (implicit cents)  | `priceCents` (explicit)     | Sync mapping bugs    |
| Commerce      | `total` (implicit cents)  | `totalCents` (explicit)     | Sync mapping bugs    |
| Games         | `player1Id` / `player2Id` | `playerAUid` / `playerBUid` | Incompatible schemas |
| Games         | status: `"completed"`     | status: `"complete"`        | Enum mismatch        |
| Notifications | `isRead`                  | `read`                      | Sync mapping bugs    |

**Fix:** Standardize naming during consolidation phases. For commerce, adopt the explicit `*Cents` suffix. For games, the new PostgreSQL tables (Phase 2) should use the Firestore naming convention since that's the active codebase.

---

### H9. Active Check-in Missing Geolocation Validation

**File:** `firestore.rules:232-233`

Latitude and longitude fields are type-checked (`is number`) but not range-validated. Accepts latitude=999999.

**Fix:** Add range checks: `latitude >= -90 && latitude <= 90`, `longitude >= -180 && longitude <= 180`.

---

## MEDIUM Findings

### M1. Dual Presence System — Firestore + Redis

Client writes presence to Firestore (`usePresenceStore.ts`). Server writes presence to Redis (`server/socket/handlers/presence.ts`). Two sources of truth for the same data.

**Fix:** Pick one. Firestore for client-facing real-time display, Redis for server-side connection tracking. Document the boundary.

---

### M2. Uploads Publicly Readable by All Authenticated Users

**File:** `storage.rules:75-80`

`/uploads/{userId}/{path=**}` allows `read: if isAuthenticated()`. Any logged-in user can read any other user's uploaded media.

**Fix:** Restrict to `isOwner(userId)` or use signed URLs.

---

### M3. Spot Images Writable by Any Authenticated User

**File:** `storage.rules:61-69`

Any authenticated user can create/update images under `/spots/{spotId}/`. No ownership check.

**Fix:** Restrict writes to spot creator or admin.

---

### M4. Missing Rate Limiting on Firestore Client Writes

**File:** `firestore.rules` (all client-writable collections)

`chat_messages`, `active_checkins`, `challenge_votes`, `games`, `videos` — no write rate limiting. A malicious user could spam writes to exhaust Firestore quota.

**Fix:** Add timestamp-based rate limiting rules for high-volume collections.

---

### M5. Environment Isolation Rules Are Unused

**File:** `firestore.rules:72-84`

Rules define `/env/staging/` and `/env/prod/` read-only blocks, but no client or server code uses environment-prefixed paths. All operations hit root-level collections.

**Fix:** Either implement `getEnvPath()` across all Firestore operations or remove the unused rules.

---

### M6. Battle Voting State Machine Split Transaction

**File:** `server/services/battle/service.ts:82-86`

`initializeVoting` creates `battleVoteState` inside a transaction, then updates the `battles` table outside the transaction. If the second write fails, vote state exists but the battle status is stale.

**Fix:** Move both writes into a single PostgreSQL transaction.

---

### M7. No Firestore Health Check in Monitoring

**File:** `server/monitoring/index.ts`

`/api/health` checks PostgreSQL, Redis, and FFmpeg. Firestore is not checked. If Firestore is down, all real-time features silently fail.

**Fix:** Add Firestore connectivity check to the health endpoint.

---

### M8. Missing Server-Side Environment Validation

**File:** `server/config/env.ts`

Server uses `NODE_ENV` (development/production/test) but doesn't map to `APP_ENV` (prod/staging/local) used by `@skatehubba/config`. No startup assertions for environment wiring.

**Fix:** Import and call `assertEnvWiring()` from `@skatehubba/config` at server startup.

---

### M9. Orphaned Firestore Rules for Migrated Collections

**Files:** `firestore.rules:90-105`

Rules exist for `moderation_users`, `reports`, `mod_actions`, `moderation_quotas` — all of which were migrated to PostgreSQL in migration `0005_consolidate_to_postgresql.sql`. The rules are all-deny (`allow read, write: if false` or owner-read-only), so they're not a security issue, but they're dead weight that creates confusion about what's active.

**Fix:** Remove rules for fully migrated collections. Add comment listing them as historical.

---

### M10. Dead PostgreSQL Tables Never Queried

**Files:** `packages/shared/schema/tricks.ts`, `tutorials.ts`, `notifications.ts`, `commerce.ts`

Several tables are defined in the schema but never imported or queried in server code:

| Table                     | Schema File      | Status                 |
| ------------------------- | ---------------- | ---------------------- |
| `trickMastery`            | tricks.ts        | Defined, never queried |
| `tutorialSteps`           | tutorials.ts     | Defined, never queried |
| `userProgress`            | tutorials.ts     | Defined, never queried |
| `notificationPreferences` | notifications.ts | Defined, never queried |
| `donations`               | commerce.ts      | Defined, never queried |

Not harmful (empty tables cost nothing in Neon), but creates schema bloat and false expectations about feature completeness.

**Fix:** Either implement the features that use these tables or mark them as `@deprecated` with a TODO comment indicating they're placeholders for future features.

---

## LOW Findings

### L1. Signup Email Regex Too Permissive

**File:** `firestore.rules:293`

Pattern `^[^@\s]+@[^@\s]+\.[^@\s]+$` accepts invalid emails like `a@b.c`.

### L2. Profile Username Orphan Risk

**File:** `server/routes/profile.ts:225`

`safeRelease()` can fail silently during error cleanup, permanently orphaning a reserved username.

---

## PostgreSQL Layer — Passing Audit

| Check                   | Status | Notes                                                              |
| ----------------------- | ------ | ------------------------------------------------------------------ |
| Foreign key constraints | PASS   | Proper FKs with cascade deletes                                    |
| Query indexes           | PASS   | Composite indexes on hot paths (game sessions, trick clips, spots) |
| Connection pooling      | PASS   | max=20, idle=30s, connect=5s, statement=30s                        |
| Transaction usage       | PASS   | 15 instances of `SELECT ... FOR UPDATE`                            |
| N+1 query patterns      | PASS   | No loop-based sequential queries found                             |
| JSON column usage       | PASS   | Used for opaque metadata only, never in WHERE clauses              |
| Prepared statements     | PASS   | Drizzle ORM generates parameterized queries                        |
| SQL injection           | PASS   | All queries through ORM, no raw string interpolation               |

---

## Priority Remediation Matrix

### Immediate (Blocks Production)

| ID  | Finding                                                      | Effort |
| --- | ------------------------------------------------------------ | ------ |
| C1  | Fix `user_presence` → `presence` collection path             | 5 min  |
| C2  | Add `role: 'user'` + `createdAt` to chat message writes      | 10 min |
| C3  | Remove Firestore `profiles`/`tricks` references or add rules | 30 min |

### This Sprint

| ID  | Finding                                        | Effort |
| --- | ---------------------------------------------- | ------ |
| C4  | Implement notification Firestore sync          | 2 hr   |
| C5  | Add sync health monitoring job                 | 4 hr   |
| C8  | Add `getEnvPath()` to server Firestore writes  | 1 hr   |
| C9  | Add `rate_limits` deny rule to firestore.rules | 5 min  |
| H1  | Move user doc creation server-side             | 2 hr   |
| H4  | Fix Firestore rule helper null pointer risk    | 30 min |
| H6  | Fix restock silent failure + partial batch     | 3 hr   |
| H7  | Move consumeHold inside transaction            | 1 hr   |

### Next Sprint

| ID    | Finding                                                                                    | Effort |
| ----- | ------------------------------------------------------------------------------------------ | ------ |
| C4    | Implement remaining projection syncs (users.xp, leaderboard, gameSessions, challengeVotes) | 8 hr   |
| H3    | XP write-through on all XP-modifying endpoints                                             | 4 hr   |
| H5    | Audit and document user read access decision                                               | 1 hr   |
| H8    | Standardize field naming for consolidation                                                 | 2 hr   |
| H9    | Add geolocation range validation                                                           | 15 min |
| M1-M8 | Medium findings                                                                            | 8 hr   |

### Addressed by Consolidation Plan (Q2-Q3)

| ID  | Finding                                           |
| --- | ------------------------------------------------- |
| C6  | Remote S.K.A.T.E. Firestore-only writes → Phase 2 |
| C7  | Commerce Firestore-only writes → Phase 3          |
| H8  | Schema naming standardization → Phase 2-3         |

---

## Methodology

Seven parallel audit agents examined:

1. **Data boundary violations** — Every client and server Firestore write checked against DATA_BOUNDARIES.md rules
2. **Sync gap analysis** — Each of 5 documented projection collections traced through code for write-through implementation
3. **Orphaned collections** — Firestore rules cross-referenced against application code references
4. **Security rules** — Every rule analyzed for permissiveness, field validation, and rate limiting; cross-referenced against client write patterns
5. **Schema consistency** — PostgreSQL and Firestore schemas compared field-by-field across all 4 overlapping domains
6. **Dual-write error handling** — Every multi-store write path traced for transaction boundaries, rollback logic, and failure modes
7. **Environment isolation** — Firestore path namespacing traced from config package through server and client code
