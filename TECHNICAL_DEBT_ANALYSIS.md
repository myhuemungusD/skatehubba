# Technical Debt Analysis — SkateHubba

**Date:** 2026-02-10
**Scope:** Full codebase (`client/`, `server/`, `mobile/`, `web/`, `packages/`, `functions/`)
**Files analyzed:** ~530+ TypeScript files, 12 package.json files, 8 tsconfig files, 6 CI workflows, 65+ test files

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Debt Severity Matrix](#2-debt-severity-matrix)
3. [Architecture & Structural Debt](#3-architecture--structural-debt)
4. [Code Quality Issues](#4-code-quality-issues)
5. [Testing Gaps](#5-testing-gaps)
6. [Security Concerns](#6-security-concerns)
7. [Dependency Health](#7-dependency-health)
8. [Configuration & DevOps Debt](#8-configuration--devops-debt)
9. [Prioritized Remediation Plan](#9-prioritized-remediation-plan)

---

## 1. Executive Summary

SkateHubba is a well-structured monorepo with clear separation of concerns across client (Vite+React), server (Express), mobile (Expo), and shared packages. The codebase shows strong fundamentals — TypeScript strict mode is enabled everywhere, Drizzle ORM prevents SQL injection, and authentication includes MFA and audit logging.

However, the analysis identified **47 distinct technical debt items** across six categories. The most impactful issues are:

- **Dead code and abandoned modules** (`web/`, empty packages, legacy `users` table)
- **Monolithic schema file** (1,307 lines in a single `schema.ts`)
- **Critical testing gaps** (0% test coverage on payments, 24% route-level coverage)
- **Dual authentication system** (Firebase + custom JWT coexistence)
- **Dependency version drift** across workspace packages

**Overall Debt Grade: C+** — Functional and shippable, but accumulating maintenance cost.

---

## 2. Debt Severity Matrix

| # | Issue | Category | Severity | Effort | Files Affected |
|---|-------|----------|----------|--------|----------------|
| 1 | Dead `web/` Next.js app | Architecture | CRITICAL | Low | 6 files |
| 2 | Monolithic schema.ts (1,307 lines) | Architecture | CRITICAL | Medium | 1 file, many consumers |
| 3 | Zero payment/Stripe test coverage | Testing | CRITICAL | Medium | `stripeWebhook.ts` |
| 4 | Duplicate user tables (`users` + `customUsers`) | Architecture | CRITICAL | High | Schema + all auth refs |
| 5 | Business logic in route handlers | Architecture | CRITICAL | High | 13 route files, ~4,000 LOC |
| 6 | Dev admin bypass via header | Security | HIGH | Low | `middleware.ts:39` |
| 7 | Mock token acceptance in dev mode | Security | HIGH | Low | `login.ts:36-55` |
| 8 | Firebase Admin major version gap (v12 vs v13) | Dependencies | HIGH | Low | `functions/package.json` |
| 9 | Only 24% route-level test coverage | Testing | HIGH | High | 13 untested routes |
| 10 | Zero integration/E2E tests for critical flows | Testing | HIGH | High | All critical paths |
| 11 | Empty workspace packages (db, firebase, utils) | Architecture | HIGH | Low | 3 packages |
| 12 | Dual auth system (Firebase + custom JWT) | Architecture | HIGH | Very High | 189 references |
| 13 | Competing state management patterns | Architecture | HIGH | Medium | Client + mobile stores |
| 14 | `any` type usage in 59 files | Code Quality | HIGH | Medium | 59 files |
| 15 | ESLint `no-explicit-any` disabled | Config | HIGH | Low | `eslint.config.mjs:69` |
| 16 | No CI caching (node_modules/Turbo) | DevOps | HIGH | Low | `ci.yml` |
| 17 | React version mismatch (18.2 vs 18.3) | Dependencies | MEDIUM | Low | 3 package.json files |
| 18 | Inconsistent TypeScript path aliases | Config | MEDIUM | Medium | 5 tsconfig files |
| 19 | Redundant E2E frameworks (Cypress + Playwright) | Dependencies | MEDIUM | Low | `client/package.json` |
| 20 | Redundant icon libraries (lucide + react-icons) | Dependencies | MEDIUM | Low | `client/package.json` |
| 21 | console.log in production (152 occurrences) | Code Quality | MEDIUM | Medium | 26 files |
| 22 | Inconsistent error handling patterns | Code Quality | MEDIUM | Medium | 15+ files |
| 23 | Duplicated API fetch patterns (not using apiRequest) | Code Quality | MEDIUM | Medium | 15+ client files |
| 24 | Missing foreign key constraints | Architecture | MEDIUM | Medium | `schema.ts` |
| 25 | In-memory reauth fallback (not cluster-safe) | Security | MEDIUM | Low | `middleware.ts:228` |
| 26 | Inconsistent admin checking (2 mechanisms) | Security | MEDIUM | Medium | metrics + middleware |
| 27 | Input validation missing on 35% of routes | Security | MEDIUM | Medium | 6 routes |
| 28 | No bundle size tracking | DevOps | MEDIUM | Low | Missing tooling |
| 29 | Env variable sprawl (44+ variables) | Config | MEDIUM | Medium | `.env.example` |
| 30 | Coverage threshold at 50% (low) | Testing | MEDIUM | Ongoing | `vitest.config.mts` |
| 31 | Turbo output path incorrect (`../dist/**`) | Config | MEDIUM | Low | `turbo.json` |
| 32 | `@types/node` version gap (v18 vs v22) | Dependencies | MEDIUM | Low | 2 package.json files |
| 33 | Functions locked to Node 18 (rest requires 20) | Config | MEDIUM | Medium | `functions/` |
| 34 | Duplicated Radix UI components (client + web) | Dependencies | LOW | Low | 2 package.json files |
| 35 | Hardcoded magic numbers/timeouts | Code Quality | LOW | Low | 10+ instances |
| 36 | Duplicated validation schemas | Code Quality | LOW | Low | 3 files |
| 37 | File naming inconsistencies | Code Quality | LOW | Low | Project-wide |
| 38 | No shared API client for mobile | Architecture | LOW | Medium | Mobile API calls |
| 39 | pnpm overrides not documented | Config | LOW | Low | `package.json:76-83` |
| 40 | Mobile module type mismatch (commonjs vs esm) | Config | LOW | Medium | `mobile/package.json` |
| 41 | Prettier config minimal (5 options) | Config | LOW | Low | `.prettierrc` |
| 42 | No SBOM generation in CI | DevOps | LOW | Low | `security.yml` |
| 43 | Mobile E2E coverage essentially absent | Testing | LOW | High | `mobile/e2e/` |
| 44 | Cypress tests reference undefined selectors | Testing | LOW | Low | `cypress/e2e/` |
| 45 | Socket.io underutilized (5 references in client) | Architecture | LOW | N/A | Client files |
| 46 | esbuild target Node 18 (should be 20) | Config | LOW | Low | `esbuild.config.mjs` |
| 47 | Duplicated battleStateService legacy function | Code Quality | LOW | Low | 68 duplicated lines |

---

## 3. Architecture & Structural Debt

### 3.1 Dead `web/` Directory — CRITICAL

The `web/` directory contains a Next.js 15 app with **6 files and zero business logic**:

```
web/app/page.tsx → "Coming soon" placeholder
web/app/layout.tsx → Minimal metadata
```

Meanwhile, `client/` (Vite+React) has **245 files** with full feature implementation. The `web/` directory creates confusion about which frontend is canonical, adds to dependency install time, and appears in Turbo build graphs.

**Recommendation:** Delete `web/` or document its purpose explicitly. If Next.js migration is planned, create a tracking issue instead of keeping dead code.

### 3.2 Monolithic Schema — CRITICAL

`packages/shared/schema.ts` is **1,307 lines** containing all database table definitions, Zod validation schemas, enum declarations, and insert schema types for 43+ tables.

**Problems:**
- Single file ownership creates merge conflicts
- Impossible to understand module boundaries at a glance
- Changes to one domain (e.g., games) require loading all domains

**Recommended split:**

| New File | Contents | ~Lines |
|----------|----------|--------|
| `schema/auth.ts` | users, customUsers, sessions, MFA, audit | ~250 |
| `schema/spots.ts` | spots, checkIns, filmerRequests | ~200 |
| `schema/games.ts` | games, gameTurns, disputes, enums | ~300 |
| `schema/content.ts` | trickClips, tricks, trickMastery | ~150 |
| `schema/commerce.ts` | products, orders, donations | ~150 |
| `schema/social.ts` | tutorials, progress, subscribers, feedback | ~150 |
| `schema/index.ts` | Re-exports all schemas | ~30 |

### 3.3 Duplicate User Tables — CRITICAL

Two user tables coexist in the schema:

```typescript
// Line 82 — Legacy Replit Auth table
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
});

// Line 150 — Active custom auth table
export const customUsers = pgTable("custom_users", {
  id: varchar("id").default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firebaseUid: varchar("firebase_uid").unique(),
  passwordHash: varchar("password_hash"),
});
```

The server references `customUsers` in **189 places**. The `users` table appears to be a leftover from Replit Auth integration.

**Risk:** Data inconsistency, split user identities, confusing onboarding for contributors.

**Recommendation:** Audit whether `users` table has any active rows. If not, drop it and its references. If so, create a migration plan to consolidate.

### 3.4 Business Logic in Route Handlers — CRITICAL

Route files contain extensive business logic that should live in the service layer:

| Route File | Lines | Business Logic Found |
|------------|-------|---------------------|
| `server/routes/games-turns.ts` | 450 | Transaction logic, game state validation, turn submission |
| `server/routes/games-disputes.ts` | ~200 | Dispute resolution, reputation penalties |
| `server/routes/games-cron.ts` | ~150 | Auto-forfeit, deadline warnings |
| `server/routes/stripeWebhook.ts` | 96 | Payment processing, tier upgrades |

The game service layer exists (`server/services/game/` — 1,017 lines across 9 files) but route handlers still perform database transactions directly instead of delegating.

**Recommendation:** Extract all `db.transaction()` calls from route handlers into service functions. Routes should only handle request parsing, response formatting, and calling services.

### 3.5 Empty Workspace Packages — HIGH

Three packages in `packages/` have no dependencies, no meaningful exports, and no consumers:

| Package | Content | Status |
|---------|---------|--------|
| `packages/db` | Empty/placeholder | DEAD |
| `packages/firebase` | Empty/placeholder | DEAD |
| `packages/utils` | Empty/placeholder | DEAD |

`packages/types` is underutilized — only imported by mobile (1 import). Client re-defines types inline instead of importing from the shared types package.

**Recommendation:** Delete empty packages. Either merge `packages/types` into `packages/shared` or have all consumers import from it.

### 3.6 Dual Authentication System — HIGH

Firebase Auth and custom JWT auth coexist:

- **Client → Firebase** for sign-up/login
- **Server → custom JWT** for session management
- **Server → Firebase Admin** for token verification
- **Database:** `customUsers` stores both `firebaseUid` AND `passwordHash`

The middleware handles both paths (`server/auth/middleware.ts`):
- Firebase token verification path
- Custom JWT session validation path
- Dev admin header bypass path

**Test evidence confirms dual paths:**
```
"changePassword verifies current password for non-Firebase users"
"changePassword skips verification for Firebase users"
```

**Risk:** Authentication bugs may only manifest for one user type. Session invalidation logic must account for both paths.

### 3.7 Competing State Management — HIGH

The client uses three overlapping patterns:

| Pattern | Usage | Files |
|---------|-------|-------|
| Zustand stores | Global auth, chat, presence | 4 stores (~500 lines total) |
| React Query | Server state caching | 16+ query hooks |
| React Context | UI component state | 3-4 contexts |

The auth store alone is **367 lines** with a complex boot sequence (bootPhase, profileStatus, loading states). Meanwhile, the mobile auth store is **34 lines** — a 10x difference for the same concern.

**Recommendation:** Standardize: Zustand for client-only global state, React Query for all server state. Remove direct fetch calls that bypass React Query.

---

## 4. Code Quality Issues

### 4.1 `any` Type Usage — HIGH

**59 files** use `any` types. ESLint's `no-explicit-any` rule is **disabled** (`eslint.config.mjs:69`).

Production examples:
- `client/src/vitals.ts:6` — `const send = (metric: any) =>`
- `mobile/src/lib/queryClient.ts:13` — `onError: (error: any) =>`
- `client/src/store/useChatStore.ts:55,70,118` — `catch (error: any)`
- `client/src/pages/skate-game.tsx:46` — `let storageInstance: any = null`

**Recommendation:** Enable `no-explicit-any` as `warn` immediately, escalate to `error` after fixing existing violations. Use `unknown` + type guards for error catches.

### 4.2 Console.log in Production — MEDIUM

**152 occurrences across 26 files**, including:
- `packages/config/src/guardrails.ts:3`
- `mobile/src/lib/firebase.config.ts:4`
- `mobile/src/lib/analytics/logEvent.ts:3`

A logger utility exists at `client/src/lib/logger.ts` but is not consistently used.

**Recommendation:** Enable `no-console` ESLint rule as `warn`. Replace all `console.log` with the logger utility. Strip debug logs in production builds.

### 4.3 Duplicated API Call Patterns — MEDIUM

At least **15+ client files** make direct `fetch()` calls instead of using the centralized `apiRequest` client at `client/src/lib/api/client.ts` (which already handles timeouts, CSRF tokens, auth headers, and error formatting).

Examples:
- `client/src/hooks/useSkateGame.ts:23,36`
- `client/src/components/PlaySkateGame.tsx` — multiple raw fetch calls
- `client/src/components/DonorRecognition.tsx` — `fetch("/api/recent-donors")`
- `client/src/pages/map.tsx` — raw fetch calls

**Recommendation:** Grep for `fetch(` in client code and migrate all calls to use `apiRequest` or React Query hooks.

### 4.4 Inconsistent Error Handling — MEDIUM

Three different error handling patterns coexist:

```typescript
// Pattern 1: any catch
catch (error: any) { logger.error(error.message) }

// Pattern 2: instanceof check
error instanceof Error ? error.message : String(error)

// Pattern 3: Optional chaining
error?.message || 'Default error'
```

**Recommendation:** Create a shared `toErrorMessage(error: unknown): string` utility. Use `unknown` instead of `any` in catch blocks.

### 4.5 Duplicated Battle Service Logic — LOW

`server/services/battleStateService.ts` (534 lines) contains both `castVote()` and `castVoteLegacy()` with **68 lines of duplicated logic** including vote insertion, winner calculation, and event logging.

### 4.6 Naming Inconsistencies — LOW

- **File naming:** Mix of `page-name.tsx`, `pageName.tsx`, `PageName.tsx`
- **Service naming:** `service.ts` vs `trickmint.ts` vs `profile.service.ts`
- **Schema tables:** `camelCase` JS names map to `snake_case` DB names (correct Drizzle pattern, but undocumented)

---

## 5. Testing Gaps

### 5.1 Route-Level Test Coverage — CRITICAL

Only **4 out of 17 route modules** have tests (24%):

| Route | Tested | Risk |
|-------|--------|------|
| `stripeWebhook.ts` | NO | **CRITICAL** — Payment processing untested |
| `games-cron.ts` | NO | **CRITICAL** — Auto-forfeit affects game integrity |
| `games-management.ts` | NO | Game forfeit endpoint |
| `games-challenges.ts` | NO | Challenge creation |
| `games-disputes.ts` | NO | Dispute resolution |
| `trickmint.ts` | NO | Video upload pipeline |
| `analytics.ts` | NO | Event tracking |
| `filmer.ts` | NO | Filmer requests |
| `metrics.ts` | NO | Admin metrics |
| `moderation.ts` | NO | Trust & safety |
| Auth routes (5 files) | NO | Login, password reset, MFA |
| `admin.ts` | YES | |
| `profile.ts` | YES | |
| `notifications.ts` | YES | |
| `games.ts` (partial) | YES | |

### 5.2 Stripe/Payment Testing — CRITICAL

`server/routes/stripeWebhook.ts` has **zero tests** covering:
- Webhook signature verification (line 43)
- Checkout session completion (line 60)
- User tier upgrade after payment
- Idempotency on webhook retries
- Error handling for Stripe API failures

### 5.3 Coverage Thresholds — MEDIUM

Current thresholds in `vitest.config.mts`:

| Metric | Current Threshold | Industry Standard |
|--------|------------------|-------------------|
| Statements | 50% | 70-80% |
| Branches | 43% | 60-70% |
| Functions | 55% | 70-80% |
| Lines | 50% | 70-80% |

Target is 60% by Q2 2026. Mobile is completely excluded from coverage.

### 5.4 E2E Test Coverage — LOW

- **Cypress:** Only 2 test files, with references to undefined custom commands (`cy.login()`) and missing `data-testid` selectors
- **Mobile E2E (Detox):** 3 files with minimal content
- **Playwright:** Listed as dependency but no meaningful tests found

Critical untested user flows:
- Complete login → profile setup → dashboard
- Game creation → turn submission → completion
- Payment → tier upgrade → feature unlock
- Video upload → processing → display

### 5.5 Mock Overuse in Existing Tests — MEDIUM

Tests like `server/__tests__/auth-routes-integration.test.ts` mock **all database calls**, meaning:
- Schema mismatches go undetected
- Transaction behavior untested
- Race conditions invisible

---

## 6. Security Concerns

### 6.1 Dev Admin Bypass — HIGH

`server/auth/middleware.ts:39`:
```typescript
if (process.env.NODE_ENV !== "production" && req.headers["x-dev-admin"] === "true") {
  req.currentUser = { id: "dev-admin-000", /* full admin */ };
  return next();
}
```

**Risk:** If `NODE_ENV` is misconfigured in staging, any request with `x-dev-admin: true` header gets full admin access.

**Recommendation:** Remove entirely, or gate behind a cryptographic dev token that's never committed.

### 6.2 Mock Token Acceptance — HIGH

`server/auth/routes/login.ts:36-46`:
```typescript
const isMockToken = idToken === "mock-google-token" || idToken === "mock-token";
if (isMockToken && isDevelopment) {
  decoded = { uid: "mock-google-uid-12345", ... };
}
```

**Risk:** Hardcoded mock credentials that bypass Firebase verification in any non-production environment.

**Recommendation:** Move mock auth to test utilities only. Never accept mock tokens in any deployed environment.

### 6.3 JWT Secret Fallback — MEDIUM

The `SECURITY_HEALTH_CHECK.md` documents a known issue: the JWT secret may fall back to a hardcoded default if `JWT_SECRET` env var is missing, rather than failing on startup.

**Recommendation:** Fail hard on missing `JWT_SECRET`. Add startup validation for all required secrets.

### 6.4 In-Memory Reauth Fallback — MEDIUM

`server/auth/middleware.ts:228-234`:
```typescript
if (redis) {
  const val = await redis.get(`${REAUTH_KEY_PREFIX}${userId}`);
} else {
  const lastAuth = recentAuthsFallback.get(userId); // In-memory Map
}
```

**Risk:** In-memory fallback doesn't survive server restarts and isn't shared across instances. In a load-balanced setup, re-authentication can be bypassed by hitting a different server.

### 6.5 Input Validation Gaps — MEDIUM

65% of routes have Zod validation. Notable gaps:
- `games-management.ts` — No validation on `gameId` param format
- `games-cron.ts` — No input validation (background job, lower risk)
- `metrics.ts` — No validation (admin-only, lower risk)

### 6.6 Inconsistent Admin Checking — MEDIUM

Two different admin verification mechanisms exist:
1. `metrics.ts` checks `req.currentUser.roles.includes("admin")`
2. `middleware.ts` checks Firebase custom claims (`decoded.admin === true`)

These could diverge if a user has admin in one system but not the other.

---

## 7. Dependency Health

### 7.1 Version Mismatches — HIGH

| Package | Location A | Location B | Gap |
|---------|-----------|-----------|-----|
| `firebase-admin` | `functions/` → `^12.0.0` | `server/` → `^13.0.0` | **Major version** |
| `react` | `client/` → `^18.2.0` | `mobile/` → `^18.3.1` | Minor |
| `firebase` | `client/` → `^11.0.2` | `mobile/` → `^11.2.0` | Minor |
| `@types/node` | `functions/` → `^18.0.0` | `server/` → `^22.19.9` | **4 major versions** |
| `zod` | `root/` → `3.23.8` (pinned) | `server/` → `^3.23.8` (caret) | Range mismatch |

### 7.2 Redundant Dependencies — MEDIUM

- **Icon libraries:** Both `lucide-react` (449 icons, ~30KB) and `react-icons` (30,000+ icons, ~300KB) in client
- **E2E frameworks:** Both `cypress` and `@playwright/test` in client devDependencies
- **Radix UI components:** Identical versions duplicated in `client/` and `web/` package.json

### 7.3 Deprecated Packages — MEDIUM

- `ts-node` variants in lockfile — deprecated in favor of `tsx`
- `glob` — old versions with publicized security vulnerabilities

### 7.4 Bundle Weight Concerns — MEDIUM

Heavy client-side dependencies without tree-shaking analysis:
- `firebase` (~310KB)
- `leaflet` (~140KB)
- `socket.io-client` (~100KB)
- `framer-motion` (~60KB)

No bundle analysis tooling is configured.

---

## 8. Configuration & DevOps Debt

### 8.1 TypeScript Path Alias Inconsistency — MEDIUM

Five different alias configurations exist:

| Config | `@/*` Points To | Shared Alias |
|--------|----------------|--------------|
| Root | `./client/src/*` | `@shared/*` |
| Client | `src/*` | `@shared/*` |
| Server | *(not defined)* | `@shared/*` |
| Mobile | `./src/*` | `shared/*` *(different!)* |
| Web | `./*` *(different!)* | *(not defined)* |

Mobile uses `shared/*` (no `@` prefix) and `@skatehubba/types` — different from all other packages.

### 8.2 CI Pipeline Inefficiency — HIGH

- **No caching:** `pnpm install` runs fresh on every CI run without `actions/cache`
- **Duplicate lockfile check:** Lockfile integrity verified in separate job, then `--frozen-lockfile` runs again in build job
- **Mobile E2E gated by label:** Only runs when PR has `e2e` label, not by default
- **Coverage not enforced in CI:** Coverage badge generated but threshold not a gate

### 8.3 Build Configuration Issues — MEDIUM

- `turbo.json` has incorrect output path: `../dist/**` goes up to parent directory
- `esbuild.config.mjs` targets Node 18 but `engines` requires Node 20+
- Functions package locked to Node 18 while rest of project requires 20+

### 8.4 Environment Variable Sprawl — MEDIUM

`.env.example` contains **44+ variables** including:
- Legacy Replit variables (`REPL_ID`, `REPL_OWNER`, `REPL_SLUG`)
- Duplicate Firebase config (`EXPO_PUBLIC_*` and `VITE_*` versions)
- No grouping, documentation of required vs optional, or value constraints

---

## 9. Prioritized Remediation Plan

### Phase 1: Quick Wins (Low Effort, High Impact)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Delete `web/` directory | 1 hour | Removes dead code confusion |
| 2 | Delete empty packages (db, firebase, utils) | 30 min | Cleaner workspace |
| 3 | Remove dev admin bypass or add cryptographic gating | 1 hour | Security hardening |
| 4 | Remove mock token acceptance from deployed envs | 1 hour | Security hardening |
| 5 | Fix Turbo `../dist/**` output path | 15 min | Correct build caching |
| 6 | Align `@types/node` versions | 30 min | Consistent type checking |
| 7 | Add CI caching for node_modules and Turbo | 1 hour | Faster CI runs |
| 8 | Enable `no-explicit-any` as `warn` in ESLint | 15 min | Start catching `any` usage |

### Phase 2: Core Improvements (Medium Effort, High Impact)

| # | Action | Effort |
|---|--------|--------|
| 9 | Add Stripe webhook tests | 2-3 days |
| 10 | Add game-cron tests | 1-2 days |
| 11 | Add auth route-level tests | 2-3 days |
| 12 | Split `schema.ts` into domain modules | 1-2 days |
| 13 | Extract business logic from route handlers into services | 3-5 days |
| 14 | Standardize TypeScript path aliases across all packages | 1 day |
| 15 | Migrate all client fetch calls to use `apiRequest`/React Query | 2-3 days |
| 16 | Align Firebase Admin version in functions (v12 → v13) | 1 day |
| 17 | Remove `react-icons`, standardize on `lucide-react` | 1 day |
| 18 | Choose one E2E framework (Cypress OR Playwright), remove the other | 1 day |

### Phase 3: Strategic Refactoring (High Effort, Long-term Impact)

| # | Action | Effort |
|---|--------|--------|
| 19 | Audit and consolidate `users` + `customUsers` tables | 1-2 weeks |
| 20 | Unify auth system (choose Firebase OR custom JWT as primary) | 2-4 weeks |
| 21 | Create shared API client for mobile + client | 1 week |
| 22 | Increase test coverage to 70% | Ongoing |
| 23 | Add bundle size tracking and budgets | 2-3 days |
| 24 | Add integration test suite for critical flows | 1-2 weeks |
| 25 | Clean up env variable sprawl (44 → ~25 core vars) | 1-2 days |
| 26 | Upgrade Firebase Functions to Node 20 | 1-2 days |
| 27 | Fix all 59 files with `any` types | 1-2 weeks |
| 28 | Replace all 152 `console.log` with logger utility | 2-3 days |

---

*Generated by automated codebase analysis. All file paths and line numbers verified against current source.*
