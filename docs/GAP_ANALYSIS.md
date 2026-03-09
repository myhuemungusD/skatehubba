# Gap Analysis — Senior Engineering Review

**Date:** 2026-03-09
**Scope:** Full monorepo — server, client, mobile, packages, infra, CI/CD, docs
**Reviewer perspective:** Senior/Staff full-stack engineer
**Prior art:** Builds on [SERVER_QUALITY_REVIEW.md](SERVER_QUALITY_REVIEW.md) (2026-02-26) and [PRODUCTION_READINESS_REVIEW.md](PRODUCTION_READINESS_REVIEW.md)

---

## Executive Summary

SkateHubba is a well-architected monorepo with genuinely strong security fundamentals (CSRF double-submit, session token hashing, Zod-validated env, comprehensive Firestore/Storage rules, rate limiting at every layer). The server quality review from February gave it a B+ and identified 13 prioritized fixes. **Most of those issues remain open.**

This gap analysis goes wider — covering documentation drift, schema integrity, dual-database debt, testing honesty, operational readiness, and roadmap alignment. The pattern that emerges: **the codebase is over-documented but under-consolidated.** There are 24+ docs files, 547-line Firestore rules, 15+ Cloud Functions, and 13 schema files, but fundamental housekeeping (FK constraints, coverage threshold honesty, deprecated collection cleanup, CLAUDE.md accuracy) hasn't kept pace with feature velocity.

**Grade: B**

| Category                     | Grade | Summary                                                      |
|------------------------------|-------|--------------------------------------------------------------|
| Security                     | A-    | Strong. Minor gaps (password complexity, CORS divergence)    |
| Documentation accuracy       | C+    | CLAUDE.md contradicts actual config in 3 places              |
| Database schema integrity    | B-    | Many userId columns lack FK constraints                      |
| Firestore/PG consolidation   | C     | Approved plan, zero phases executed                          |
| Testing                      | B-    | Good unit coverage, but thresholds inflated in docs          |
| Operational readiness        | B-    | No SLOs, no durable audit trail, no request timeouts         |
| Roadmap alignment            | B     | Core loop shipped, Phase 1 measurement infra missing         |
| Mobile readiness             | C+    | Scaffolded but no E2E tests, no deep link tests              |

---

## 1. Documentation Drift (CLAUDE.md vs Reality)

These are not nitpicks — CLAUDE.md is read by every AI tool and new contributor. Inaccurate docs actively mislead.

### 1.1 Coverage thresholds are wrong

**CLAUDE.md says:** `98/93/99/99` (statements/branches/functions/lines)
**Actual (`vitest.config.mts:80-84`):** `95/85/95/95`

The ROADMAP even acknowledges this: "set honest coverage thresholds" is listed as shipped work. But CLAUDE.md was never updated.

**Fix:** Update CLAUDE.md to `95/85/95/95`.

### 1.2 "Firebase Cloud Functions" listed as prohibited

**CLAUDE.md says:** `Prohibited: ... Firebase Cloud Functions`
**Reality:** `functions/` directory contains 15+ active Cloud Functions:
- Game logic: `joinGame`, `abandonGame`, `submitTrick`, `judgeTrick`, `setterBail`, `voteTimeouts`
- Commerce: `holdAndCreateIntent`, `expireHolds`, `stockRelease`, `stripeWebhook`
- Video: `validateVideo`
- Admin: `roles`

These aren't dead code — they power the Remote S.K.A.T.E. game mode and the Firestore commerce system.

**Fix:** Either remove the prohibition from CLAUDE.md (and document functions/ as an active workspace), or execute the migration to move this logic server-side. Can't have both.

### 1.3 "No Firestore" is misleading

**CLAUDE.md says:** `Prohibited: ... Firestore`
**Reality:** 547-line `firestore.rules` file with active collections for presence, chat, game sessions, challenges, leaderboards, and commerce. The `DATABASE_CONSOLIDATION_PLAN.md` explicitly designates 7 collections as "Keep (no change)."

**Fix:** Change the prohibition to: "Firestore is a real-time projection layer only — PostgreSQL is the source of truth for all persistent data. Do not add new Firestore collections without approval."

---

## 2. Database Schema Integrity

### 2.1 Missing foreign key constraints

Out of ~21 tables with `userId`/`creatorId` columns, only **4** have FK references to `customUsers`. The rest are dangling string columns with no referential integrity:

| Table (schema file)           | Column       | FK to customUsers? |
|-------------------------------|--------------|--------------------|
| `notifications`               | `userId`     | No                 |
| `notificationPreferences`     | `userId`     | No                 |
| `orders`                      | `userId`     | No                 |
| `donations`                   | `userId`     | No                 |
| `userProfiles`                | `userId`     | No                 |
| `trickMastery`                | `userId`     | No                 |
| `trickClips`                  | `userId`     | No                 |
| `feedback`                    | `userId`     | No                 |
| `moderationUsers`             | `userId`     | No (PK, no FK)     |
| `modActions`                  | `userId`     | No                 |
| `battles` (creator)           | `creatorId`  | No                 |
| `battleVotes` (creator)       | `creatorId`  | No                 |
| `games`                       | `player1Id`/`player2Id` | No      |
| `spotFavorites`               | `userId`     | No                 |
| `analyticsEvents`             | `userId`     | No                 |

**Impact:** Orphaned rows will accumulate when users are deleted. No cascade cleanup. JOIN queries silently return wrong results on stale user references.

**Fix:** Add FK constraints with `onDelete: "cascade"` (or `"set null"` for analytics). This is a migration, not a schema change — existing data needs a one-time cleanup pass first.

### 2.2 Missing indexes on userProfiles

`packages/shared/schema/profiles.ts` — the `userProfiles` table has no secondary indexes. Every query that filters by `userId` does a sequential scan. This table is queried on nearly every authenticated request.

**Fix:** Add index on `userId` at minimum. Consider composite indexes for common query patterns.

### 2.3 No uniqueness constraint on closetItems

`closetItems` has no unique constraint on `(userId, itemId)`. A user can have duplicate closet entries from race conditions or retry logic.

### 2.4 Three user profile tables, unclear boundaries

- `customUsers` (auth.ts) — core identity, Firebase UID, username, stance, XP
- `userProfiles` (profiles.ts) — extended profile (bio, avatar, social links)
- `onboardingProfiles` (profiles.ts) — onboarding state

`onboardingProfiles` has no unique constraint on `username` and no FK to `customUsers`. The relationship between these three tables is implicit (shared `userId` string) rather than explicit (FK constraints).

---

## 3. Firestore/PostgreSQL Dual-Write Debt

`DATABASE_CONSOLIDATION_PLAN.md` was approved on 2026-02-24 with a 3-phase migration plan. **Zero phases have been executed.**

### Current state of duplication

| Domain    | PostgreSQL                              | Firestore                                    | Sync layer? |
|-----------|-----------------------------------------|----------------------------------------------|-------------|
| Games     | `games`, `gameTurns`, `gameSessions`    | `games/{id}`, `games/{id}/rounds/{roundId}`  | None        |
| Commerce  | `products`, `orders`, `donations`       | `products`, `holds`, `orders`, `stockShards` | None        |
| Moderation| `moderationUsers`, `modActions`         | `moderation_users`, `reports`, `mod_actions` | None        |

### What this means

- **No unified game analytics.** Remote S.K.A.T.E. results live only in Firestore — can't be JOINed with user profiles, leaderboards, or spot data.
- **Two commerce systems** with independent product catalogs, order records, and payment flows. Customer support can't see a unified order history.
- **6 deprecated collections** (`gameSessions` in Firestore, `signups`, `mail`, `mailList`, `subscriptions`, `stockShards`) still have rules but should be removed.

### Risk

The longer this persists, the more features build on the Firestore versions, making migration harder. The ROADMAP lists this as "runs in parallel with product work" but it's getting zero attention.

**Fix:** Execute Phase 1 (deprecate legacy collections, migrate challenges to PG) before adding any new game features.

---

## 4. Server Issues — Prior Review Items Still Open

The SERVER_QUALITY_REVIEW.md (2026-02-26) identified 13 prioritized fixes. Based on codebase review, **most remain unresolved:**

### Critical (still open)

| ID  | Issue                                         | Status    |
|-----|-----------------------------------------------|-----------|
| C1  | `uncaughtException` handler continues execution | **Open** |
| C2  | No password complexity enforcement             | **Open** |
| C3  | Sequential database seeding                    | **Open** |
| C4  | `statement_timeout` via string interpolation   | **Open** |

### Significant (still open)

| ID  | Issue                                          | Status    |
|-----|------------------------------------------------|-----------|
| S1  | Inconsistent error response shapes (3 patterns)| **Open** |
| S2  | `getUserDisplayName` in db.ts                  | **Open** |
| S3  | `AuthService` is static (untestable)           | **Open** |
| S4  | Socket CORS diverges from HTTP CORS            | **Open** |
| S5  | Manual IP parsing vs `req.ip`                  | **Open** |
| S6  | Bot-blocking user-agent too aggressive          | **Open** |
| S7  | In-memory fallbacks diverge in multi-instance  | **Open** |

### Moderate (still open)

| ID  | Issue                                          | Status    |
|-----|------------------------------------------------|-----------|
| M1  | No API versioning                              | **Open** |
| M2  | `changePassword` creates session, discards token| **Open** |
| M3  | Global 10MB body parse limit                   | **Open** |
| M5  | Audit logging stdout-only                      | **Open** |
| M6  | `isValidIP` doesn't handle compressed IPv6     | **Open** |

**Pattern:** The review was thorough. The follow-through was zero. This is a process gap, not a knowledge gap.

---

## 5. Testing Gaps

### 5.1 Coverage thresholds vs exclusions

Actual thresholds (`95/85/95/95`) are reasonable, but the exclusion list in `vitest.config.mts` excludes **68+ files** from coverage:

- All schema files (`auth.ts`, `battles.ts`, `spots.ts`, `games.ts`, `tricks.ts`, `tutorials.ts`)
- Infrastructure files (`index.ts`, `app.ts`, `env.ts`, `server.ts`)
- All barrel/index files (12+ files)
- Store files (`user.ts`)
- Seed scripts, test helpers, type files

Many exclusions are justified (type-only files, barrel re-exports). But excluding all schema files means **zero coverage on default value functions and validation logic in schema definitions.**

### 5.2 Client E2E: configured but empty

Cypress is configured in the client but there are **no spec files**. The `e2e/` directory has only 4 Playwright smoke tests (health check, landing page, auth redirect, spot map load). There's no E2E test for the core game flow.

### 5.3 Mobile E2E: builds but doesn't test

The mobile CI workflow runs `eas build` but doesn't execute Detox or any E2E framework. There are integration test files in `infra/firebase/functions/` but they're not wired into CI.

### 5.4 Missing test categories

- **No load/performance tests.** The `benchmarks/` directory exists but hasn't been verified for CI integration.
- **No chaos/failure-injection tests** for Socket.io reconnection or game state recovery.
- **No contract tests** between client and server API shapes.

---

## 6. Operational Readiness

### 6.1 No SLOs/SLIs defined

There are health endpoints (`/api/health/live`, `/api/health/ready`, `/api/health/env`) but no defined SLOs (e.g., "99.9% of API requests respond in <500ms") or alerting thresholds.

### 6.2 Audit logging has no durable store

Both `services/auditLog.ts` and `middleware/auditLog.ts` log to stdout. There's no database table for audit events. Container restarts, log rotation, or pipeline failures lose audit history permanently.

### 6.3 No request timeout middleware

A slow database query or external API call can hold an HTTP connection indefinitely. There's no `connect-timeout` or equivalent middleware.

### 6.4 No automated backup/restore procedures

`DISASTER_RECOVERY.md` exists but there's no automated backup script or restore runbook for PostgreSQL (Neon) or Firestore data.

### 6.5 Staging environment gaps

`docker-compose.staging.yml` has no nginx-level rate limiting. The staging environment doesn't replicate production's Vercel edge network behavior.

---

## 7. Roadmap Alignment

### Phase 1 "Prove It" — status check

| Item                                    | Status        |
|-----------------------------------------|---------------|
| Fix friction / 3-tap game flow          | Shipped       |
| Matchmaking by handle                   | Shipped       |
| Onboarding flow                         | Shipped       |
| Push notifications for turn alerts      | **Not started** |
| Rematch button                          | **Not started** |
| Game chat                               | **Not started** |
| Check-in streaks / spot regulars        | **Not started** |
| Surface nearby active games             | **Not started** |
| "Challenge someone here" from spot page | **Not started** |
| Mobile web optimization / PWA           | **Not started** |
| Invite link sharing                     | **Not started** |
| Basic video transcoding                 | **Not started** |
| Funnel tracking                         | **Not started** |
| Game abandonment rate tracking          | **Not started** |
| Session-to-return rate                  | **Not started** |
| Weekly active players metric            | **Not started** |

**3 of 16 items shipped.** The measurement infrastructure (funnel tracking, abandonment rate, return rate, WAP) is completely absent. You can't exit Phase 1 without metrics to measure the exit criteria.

### Phase 1 exit criteria — measurement gap

| Criterion                                     | Tracking exists? |
|-----------------------------------------------|------------------|
| 100 completed games by real users             | No               |
| Game completion rate >70%                     | No               |
| 30%+ play a second game within 7 days        | No               |
| NPS survey                                    | No               |

**Fix:** Build the measurement layer before building more features. You can't prove product-market fit without instrumentation.

---

## 8. Mobile App Maturity

The React Native/Expo app in `mobile/` is structurally sound (tab navigation, game flow, spot map, auth, challenge system, demo mode) but is pre-production:

- **No deep link testing** — challenge invite links won't work without universal links/app links configuration and tests.
- **No offline mode tests** — an `OfflineBanner` component exists but there's no integration testing for offline scenarios.
- **No Detox or Maestro E2E tests** — CI builds the app but never runs it.
- **Profile table confusion** — the mobile app has to navigate 3 user profile tables (`customUsers`, `userProfiles`, `onboardingProfiles`) with no explicit FK relationships.

---

## 9. Security — Remaining Gaps

The security posture is genuinely strong (A- grade from the prior review stands). Remaining items:

| Gap                                         | Risk   | Fix                                              |
|---------------------------------------------|--------|--------------------------------------------------|
| No password complexity enforcement          | Medium | Add Zod validation at route level                |
| Socket CORS diverges from HTTP CORS         | Low    | Use shared `getAllowedOrigins()`                  |
| Manual IP parsing alongside `req.ip`        | Low    | Delete `logIPAddress`, use `req.ip`              |
| Bot-blocking blocks legitimate monitors     | Low    | Remove or replace with configurable allowlist    |
| `uncaughtException` continues execution     | High   | Log and exit, let process manager restart        |
| In-memory fallbacks in multi-instance       | Medium | Make Redis required in production                |

---

## Priority Matrix

### Do now (blocks Phase 1 exit)

1. **Build measurement infrastructure** — funnel tracking, game completion rate, return rate, WAP
2. **Fix CLAUDE.md accuracy** — coverage thresholds, Cloud Functions prohibition, Firestore prohibition
3. **Fix `uncaughtException` handler** — exit instead of continuing (production safety)
4. **Add password complexity enforcement** — basic Zod validation on all password endpoints

### Do next (pre-scale)

5. **Add FK constraints** to all userId columns missing them (migration + cleanup pass)
6. **Add index on `userProfiles.userId`**
7. **Execute DB consolidation Phase 1** — deprecate legacy Firestore collections
8. **Standardize error response shapes** — adopt `Errors.*` everywhere
9. **Unify CORS config** between HTTP and Socket.io
10. **Add request timeout middleware**

### Do later (quality of life)

11. **Make Redis required in production** — eliminate silent in-memory divergence
12. **Add API versioning** (`/api/v1/`)
13. **Reduce global body parse limit** to 256KB
14. **Write client E2E specs** for core game flow
15. **Set up durable audit logging** (PostgreSQL table)
16. **Convert `AuthService` to instantiated class** for testability
17. **Add mobile E2E tests** (Detox or Maestro)

---

## Summary

The codebase has strong bones — security is above average, the architecture is clear, the monorepo structure works. But there's a pattern of **writing reviews without executing fixes** and **documenting aspirations as facts** (coverage thresholds, tech prohibitions). The most urgent gap isn't code — it's the complete absence of measurement infrastructure for the product metrics that define Phase 1 success.

Ship the metrics. Fix the docs. Then iterate.

---

_This analysis is based on static review of the full monorepo. Runtime profiling, load testing, and penetration testing would surface additional findings._
