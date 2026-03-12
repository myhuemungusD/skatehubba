# SkateHubba Framework Audit Report

**Date:** 2026-03-11
**Scope:** Full-stack framework audit — security, database, API, client, build pipeline, real-time, game logic
**Overall Grade:** **A-**

---

## Executive Summary

SkateHubba demonstrates strong security fundamentals with defense-in-depth architecture, comprehensive auth controls, proper input validation, and extensive rate limiting. The platform successfully mitigates OWASP Top 10 vulnerabilities. This audit identified **8 critical**, **22 medium**, and **30+ low** severity findings across 6 domains.

### Findings by Severity

| Severity | Count | Domains |
|----------|-------|---------|
| CRITICAL / HIGH | 8 | Auth gaps, missing FKs, crash risks, deploy ordering |
| MEDIUM | 22 | Race conditions, missing indexes, design debt, CI gaps |
| LOW | 30+ | Code smells, minor inconsistencies, nice-to-haves |

---

## 1. Security Audit

**Grade: A-**

### Strengths

- **Multi-layered auth**: Firebase Auth (identity) + JWT sessions + optional Bearer tokens
- **Session security**: SHA256-hashed tokens, 24h expiry, timing-safe comparisons
- **Re-authentication**: 5-minute window for sensitive ops, Redis-backed
- **Admin access control**: Firebase custom claims + role verification, dev bypass blocked in production
- **Input validation**: Zod schemas across all write endpoints, ReDoS-safe email regex
- **No SQL injection vectors**: Drizzle ORM used throughout (parameterized queries only)
- **CSRF protection**: Double-submit cookie with timing-safe comparison
- **15+ rate limiters**: Email signup, password reset, MFA verify, game writes, uploads, etc.
- **Secret management**: Fail-fast validation at boot, multi-layer scanning (Gitleaks + Secretlint + CodeQL)
- **File upload security**: MIME whitelisting, size limits, signed URLs with 15-min expiry
- **MFA**: AES-256-GCM encryption, separate key from JWT, HMAC verification

### Critical Findings

| ID | Issue | File | Lines |
|----|-------|------|-------|
| SEC-1 | `/api/remote-skate` routes bypass `authenticateUser` middleware; use inline custom `verifyFirebaseAuth()` instead | `server/routes/remoteSkate.ts` | 138, 272, 317, 373, 458, 546, 647 |
| SEC-2 | Game challenge/turn/dispute routes use `req.currentUser!` (non-null assertion) without explicit auth middleware on individual routes — relies solely on parent router | `server/routes/games-challenges.ts` | 26, 105 |

### Medium Findings

| ID | Issue | File |
|----|-------|------|
| SEC-3 | CORS origin pre-check before `cors()` middleware is redundant and could interfere with preflight | `server/app.ts:104-112` |
| SEC-4 | CSRF exemption list is hardcoded; new auth endpoints must be manually added | `server/app.ts:179` |
| SEC-5 | `unsafe-inline` in CSP `styleSrc` (documented as deferred, pending CSS-in-JS migration) | `server/app.ts:44-59` |

### Low Findings

- `dangerouslySetInnerHTML` for JSON-LD structured data (safe — JSON.stringify, not user input) — `client/src/components/StructuredData.tsx:43,81`
- Moderation reports don't require email verification (may be intentional) — `server/routes/moderation.ts:27-52`

---

## 2. Database Audit

**Grade: B+**

### Strengths

- **Distributed locking**: Proper `SELECT FOR UPDATE` in all critical transactions (game turns, disputes, quotas)
- **No N+1 query patterns** detected
- **Connection pooling**: Configurable max connections, idle/connection/statement timeouts
- **All SQL parameterized**: No injection risks in raw SQL usage
- **Comprehensive migration 0013**: Retroactively adds missing FKs, indexes, and constraints with safety checks
- **Unique constraints**: Per-user spot ratings, one check-in per day, clip view dedup
- **Audit trails**: `createdAt`/`updatedAt` on all user-facing tables

### Critical Findings — Missing Foreign Keys

| ID | Table.Column | Missing FK Target | File |
|----|-------------|-------------------|------|
| DB-1 | `checkinNonces.spotId` | `spots.id` | `packages/shared/schema/spots.ts:181` |
| DB-2 | `posts.userId` | `customUsers.id` | `packages/shared/schema/moderation.ts:119` |
| DB-3 | `battles.creatorId` | `customUsers.id` | `packages/shared/schema/battles.ts:11` |
| DB-4 | `battles.opponentId` | `customUsers.id` | `packages/shared/schema/battles.ts:12` |
| DB-5 | `battleVoteState.creatorId` | `customUsers.id` | `packages/shared/schema/battles.ts:47` |
| DB-6 | `battleVoteState.opponentId` | `customUsers.id` | `packages/shared/schema/battles.ts:48` |
| DB-7 | `moderationQuotas.userId` | `customUsers.id` | `packages/shared/schema/moderation.ts:94` |

### Medium Findings

| ID | Issue | File |
|----|-------|------|
| DB-8 | `deviceTokens` timestamps lack `{ withTimezone: true }` — inconsistent with rest of schema | `packages/shared/schema/notifications.ts:107-108` |
| DB-9 | Missing indexes on `battles` table (`creatorId`, `opponentId`, status+createdAt composite) | `packages/shared/schema/battles.ts` |
| DB-10 | Missing indexes on `moderationProfiles` (`isBanned`, `proVerificationStatus`) | `packages/shared/schema/moderation.ts` |
| DB-11 | Missing index on `checkinNonces.userId` | `packages/shared/schema/spots.ts` |
| DB-12 | Missing down migrations for 0005, 0006, 0007 | `migrations/` |

---

## 3. API Routes Audit

**Grade: B+**

### Strengths

- **Centralized error handler** with Sentry integration, stack traces excluded in production
- **Comprehensive rate limiting** (20+ specific limiters)
- **Proper HTTP status codes**: 201 for creation, 204 for no-content, 401/403/404/429 consistently
- **Zod validation** across endpoints
- **Stripe webhook**: Signature verification, idempotency with Redis + DB-level guard, currency validation

### Critical Findings — Missing Return Statements

| ID | Issue | File | Line |
|----|-------|------|------|
| API-1 | `Errors.internal()` called without `return` — function continues executing after sending response | `server/routes/games-challenges.ts` | 97 |
| API-2 | Same missing return issue | `server/routes/games-turns.ts` | 79 |
| API-3 | Same missing return issue | `server/routes/games-disputes.ts` | 84 |

### Medium Findings

| ID | Issue | File |
|----|-------|------|
| API-4 | Game routes don't use `asyncHandler` wrapper — unhandled promise rejections possible | Multiple games-*.ts files |
| API-5 | `/api/users` returns up to 100 users with no pagination parameters | `server/routes/users.ts:86` |
| API-6 | Webhook in-memory dedup map unreliable in multi-instance deployments | `server/routes/stripeWebhook.ts:37-91` |
| API-7 | Inconsistent response envelope format across endpoints | Various routes |
| API-8 | `parseInt(req.params.id)` without strict validation | `server/routes/trickmint.ts:390` |
| API-9 | Cron routes rely solely on secret verification; no IP allowlist | `server/routes/cron.ts:13` |

---

## 4. Client Architecture Audit

**Grade: A-**

### Strengths

- **Environment variable security**: Belt-and-suspenders secret scrubbing at build time (DATABASE_URL, JWT_SECRET, etc.)
- **Clean Zustand state management**: Singleton stores, proper subscription cleanup, concurrent request dedup
- **Firebase token refresh**: Proactive 10-minute refresh loop prevents silent session expiry
- **Code splitting**: Route-based lazy loading, intelligent manual chunk splitting (Firebase, Leaflet, etc.)
- **API client**: Timeout handling (30s default), CSRF extraction, Sentry breadcrumbs, safe JSON parsing
- **Retry strategy**: Exponential backoff (1s/2s/4s), non-retryable 401/400, retryable 5xx
- **Accessibility**: Skip-to-main-content, route announcer, ARIA attributes, semantic HTML
- **Performance monitoring**: Web Vitals (FCP, LCP, FID, CLS, TTFB) via PerformanceObserver
- **Error boundary**: Class component with Sentry integration, dev-only stack traces

### Medium Findings

| ID | Issue | File |
|----|-------|------|
| CLI-1 | No catch-all 404 route — unmatched routes render nothing | `client/src/routes/AppRoutes.tsx` |
| CLI-2 | `getAuthToken()` doesn't force-refresh; stale tokens possible between scheduled refreshes | `client/src/lib/api/client.ts:37` |
| CLI-3 | No retry-after-force-refresh on 401 responses | `client/src/lib/queryClient.ts:34` |

### Low Findings

- `any` usage in ~36 files (11.6%), mostly test files
- Module-level variables in Zustand stores (acceptable singleton pattern)
- Missing `React.memo` on lazy route components
- `console.error` in production (`SocialShare.tsx`) instead of `logger.error()`

---

## 5. Build Pipeline & CI/CD Audit

**Grade: B+**

### Strengths

- **Multi-stage CI**: Lockfile check → format → validation → typecheck → lint → build → tests (parallel)
- **Test coverage enforcement**: 95% statements, 85% branches, 95% functions/lines
- **Secret scanning**: Gitleaks in CI on all branches/PRs
- **Security headers validation**: 500+ line test suite for Vercel config
- **Docker security**: Multi-stage build, non-root user (UID 1001), health checks, no secrets in layers
- **Staging deploy**: Trivy container scanning, health check with 5 retries, environment protection
- **Dependabot**: Weekly patch/minor updates, major versions require manual review
- **Firebase rules validation**: Properly guarded for main/PR only

### Critical Findings

| ID | Issue | File |
|----|-------|------|
| CI-1 | Database migrations run AFTER app deploy — schema mismatch risk if migration fails | `.github/workflows/deploy-staging.yml:112-126` |
| CI-2 | Docker Compose has hardcoded default staging password | `docker-compose.staging.yml:10` |

### Medium Findings

| ID | Issue | File |
|----|-------|------|
| CI-3 | CodeQL `continue-on-error: true` means security findings don't block CI | `.github/workflows/codeql.yml:42-43` |
| CI-4 | No staging-to-production promotion workflow | Missing workflow |
| CI-5 | No documented rollback strategy | Missing documentation |
| CI-6 | No `CODEOWNERS` file for mandatory review on sensitive paths | Missing `.github/CODEOWNERS` |
| CI-7 | No job-level concurrency limits — duplicate runs on rapid pushes | CI workflows |
| CI-8 | Bundle size check warns but doesn't fail CI | `scripts/check-bundle-size.mjs` |

### Low Findings

- Coverage report retention 30 days (excessive for CI)
- Trivy only scans CRITICAL/HIGH (misses MEDIUM)
- Dependabot missing some `packages/` subdirectories
- No license compliance enforcement
- `react-hooks/exhaustive-deps` as warning instead of error

---

## 6. Game Logic & Socket.io Audit

**Grade: B+**

### Strengths

- **Row-level locking**: `SELECT FOR UPDATE` in all critical game state transitions
- **Transaction isolation**: All mutations wrapped in transactions with re-checks
- **Socket.io auth**: Firebase token verification on connection
- **Socket rate limiting**: Per-socket sliding window limits
- **Room management**: Capacity checks (max 2 players), auto-cleanup every 5 minutes
- **Event validation**: Zod schemas for socket input sanitization
- **Participant validation**: All game routes verify player1/player2 membership

### Critical Findings

| ID | Issue | File | Line |
|----|-------|------|------|
| GAME-1 | Missing null checks in `setterBail()` — `game.defensivePlayerId!` crashes on corrupted state | `server/services/gameTurnService.ts` | 402-403 |
| GAME-2 | Cron forfeit logging accesses `result.loserId` outside null-check — `result` can be null | `server/routes/games-cron.ts` | 66, 74 |
| GAME-3 | Matchmaking doesn't check if opponent already has pending challenge from same user — notification spam vector | `server/routes/matchmaking.ts` | 39-59 |

### Medium Findings

| ID | Issue | File |
|----|-------|------|
| GAME-4 | Lock ordering risk: dispute resolution locks dispute-then-game; deadlock if future code locks game-then-dispute | `server/services/gameDisputeService.ts:106-199` |
| GAME-5 | Missing `socket.off()` cleanup for battle event listeners on disconnect | `server/socket/handlers/battle.ts:67-366` |
| GAME-6 | Presence broadcast goes to ALL joined rooms — no compartmentalization | `server/socket/handlers/presence.ts:142-153` |
| GAME-7 | Room membership tracked in 3 places (Socket.io native, in-memory fallback, Redis) — consistency risk | `server/socket/rooms.ts` |
| GAME-8 | No rate limit on admin dispute resolution | `server/routes/games-disputes.ts:92` |
| GAME-9 | Hardcap tie-breaking logic inconsistent with battle voting tie-breaking | `server/routes/games-cron.ts:173-182` |

### Low Findings

- Offensive/defensive role initialization not documented as intentional design
- SKATE letter calculation uses string length as array index (brittle but safe)
- Idempotency keys use only 32 bits of randomness (acceptable for internal use)
- Vote handler checks room membership but not participant status before calling service
- Redundant authorization checks in turn judge flow (defense-in-depth, not a bug)

---

## Priority Action Items

### Tier 1 — Blocking (Fix Before Next Deploy)

1. **SEC-1**: Add `authenticateUser` middleware to `/api/remote-skate` routes (7 endpoints)
2. **API-1/2/3**: Add `return` before `Errors.internal()` calls in game routes (3 files)
3. **GAME-1**: Add null guard in `setterBail()` for `defensivePlayerId`/`offensivePlayerId`
4. **GAME-2**: Add null check on `result` before logging in cron forfeit handler
5. **CI-1**: Reorder deploy pipeline — run migrations BEFORE app deployment
6. **CI-2**: Remove hardcoded default staging password from docker-compose

### Tier 2 — Urgent (Fix Within 1 Sprint)

7. **DB-1 through DB-7**: Add missing foreign key constraints (7 tables) via new migration
8. **SEC-2**: Add explicit `authenticateUser` to individual game route handlers
9. **API-4**: Wrap all game route handlers with `asyncHandler`
10. **GAME-3**: Filter matchmaking to exclude users with pending challenges
11. **CLI-1**: Add catch-all 404 route
12. **CI-3**: Remove `continue-on-error` from CodeQL (or scope it to rate-limit errors only)
13. **CI-6**: Create `CODEOWNERS` file

### Tier 3 — Important (Fix Within 2 Sprints)

14. **DB-8**: Add `{ withTimezone: true }` to `deviceTokens` timestamps
15. **DB-9/10/11**: Add missing indexes (battles, moderationProfiles, checkinNonces)
16. **API-5**: Add pagination to `/api/users` endpoint
17. **GAME-4**: Document and enforce consistent lock ordering (always games before disputes)
18. **GAME-5**: Add explicit `socket.off()` cleanup for battle listeners
19. **GAME-7**: Consolidate room membership to single source of truth
20. **CI-4**: Create staging-to-production promotion workflow
21. **CI-5**: Document rollback procedure

### Tier 4 — Low Priority (Backlog)

22. Remaining low-severity findings across all domains
23. Migrate from `unsafe-inline` in CSP styleSrc
24. Standardize API response envelope format
25. Add force-refresh retry on 401 in API client
26. Quarterly review of test coverage exclusion list

---

## Conclusion

SkateHubba has a **strong security posture** and **well-architected codebase** for its stage. The most urgent items are the missing `return` statements in error handlers (can cause double-response crashes), the auth middleware gaps on remote-skate routes, and the deploy pipeline ordering issue. Addressing the Tier 1 and Tier 2 items will bring the overall grade to a solid **A**.
