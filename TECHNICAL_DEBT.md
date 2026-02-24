# Technical Debt Assessment

**Date:** 2026-02-23
**Scope:** Full monorepo audit (client, server, mobile, functions, packages)

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH     | 4     | Broken builds, security risks, data integrity |
| MEDIUM   | 5     | Type safety gaps, code duplication, maintainability |
| LOW      | 5     | Minor inconsistencies, polish items |

**Overall health:** The codebase is well-structured with strict TypeScript, strong CI,
good security practices, and extensive tests (269 test files). The debt items below are
manageable and none represent architectural dead-ends.

---

## HIGH Severity

### 1. `functions/src/index.ts` is a 1,118-line god file

All Cloud Functions live in one file: role management, S.K.A.T.E. game logic
(`submitTrick`, `judgeTrick`, vote timeouts), video transcoding, scheduled jobs,
rate limiting, transaction monitoring, and notification dispatch.

The in-memory rate limiter (`rateLimitStore = new Map<>()`) is ineffective — each
Cloud Function cold start gets a fresh Map. The code itself acknowledges this:

```
// Rate Limiting (In-Memory for single instance, use Redis for multi-instance)
```

**Fix:** Split into `functions/src/game/`, `functions/src/admin/`,
`functions/src/video/` modules (the `commerce/` subdirectory already demonstrates
the pattern). Replace in-memory rate limiting with Firestore counters or Redis.

### 2. `.env.staging` committed to git

The file header says _"NEVER commit this file with real secrets"_ but it IS in the
repo (`.gitignore` does not exclude `.env.staging`). Values are currently empty, but
this pattern invites accidental secret commits.

**Fix:** Rename to `.env.staging.example` and add `.env.staging` to `.gitignore`.

### 3. Dockerfile references non-existent `web/` directory

```dockerfile
# Dockerfile:10
COPY web/package.json web/package.json
```

The `web/` directory does not exist in the repository. Docker builds will fail at
this step.

**Fix:** Remove the line or create the expected directory.

### 4. Duplicate migration sequence number `0007`

Two unrelated migrations share the `0007` prefix:

- `migrations/0007_add_notifications.sql`
- `migrations/0007_trickmint_video_pipeline.sql`

This can cause non-deterministic migration ordering depending on filesystem sort.

**Fix:** Renumber `0007_trickmint_video_pipeline.sql` to
`0007b_trickmint_video_pipeline.sql` (or `0011_*` as the next available number).

---

## MEDIUM Severity

### 5. ~2,200 `as any` casts across test files

| Area | Occurrences | Files |
|------|-------------|-------|
| Server tests | ~1,424 | 135 |
| Functions tests | ~319 | 5 |
| Client tests | ~197 | 17 |

While tests are exempted from the strict `no-explicit-any` lint rule, pervasive
`as any` hides type mismatches between mocks and real implementations. When
interfaces change, tests won't catch the breakage at compile time.

Worst offenders:
- `server/routes/__tests__/stripeWebhook.test.ts` — 65 occurrences
- `server/__tests__/routes/routes-branches.test.ts` — 60
- `server/__tests__/routes/routes-edge-cases.test.ts` — 50+
- `functions/src/index.test.ts` — 136

**Fix:** Create typed mock factories (e.g., `createMockRequest()`,
`createMockDb()`) that return properly typed objects instead of `as any`.

### 6. 13 files exceed 500 lines

| File | Lines |
|------|-------|
| `functions/src/index.ts` | 1,118 |
| `mobile/app/(tabs)/trickmint.tsx` | 881 |
| `mobile/src/components/game/TrickRecorder.tsx` | 824 |
| `client/src/components/ui/sidebar.tsx` | 756 |
| `client/src/pages/skate-game.tsx` | 638 |
| `server/services/filmerRequests.ts` | 541 |
| `server/services/moderationStore.ts` | 536 |
| `server/auth/mfa.ts` | 535 |
| `server/services/battleStateService.ts` | 534 |
| `client/src/lib/game/GameService.ts` | 528 |
| `server/socket/handlers/game.ts` | 515 |
| `functions/src/commerce/stripeWebhook.ts` | 510 |
| `server/services/videoTranscoder.ts` | 505 |

**Fix:** Decompose incrementally. Priority targets are the game-related files
(TrickRecorder, skate-game, GameService) since they have the most cross-cutting
logic.

### 7. Game logic duplicated across three layers

The S.K.A.T.E. game state machine is implemented independently in:

1. `functions/src/index.ts` — Firestore-based (submitTrick, judgeTrick, vote timeouts)
2. `server/services/game/` — PostgreSQL-based (tricks.ts, forfeit.ts, timeouts.ts)
3. `client/src/lib/game/GameService.ts` — Firestore client-side transactions

Three separate implementations of letter tracking, phase transitions, and win
conditions increases the risk of behavioral drift.

**Fix:** Extract shared game constants and state transition logic into
`packages/shared/game/` consumed by all three layers.

### 8. Seven accessibility lint rules weakened to warnings

```js
// eslint.config.mjs:84
// Accessibility (jsx-a11y) — warn for rules that have many existing violations
"jsx-a11y/no-autofocus": "warn",
"jsx-a11y/label-has-associated-control": "warn",
"jsx-a11y/media-has-caption": "warn",
"jsx-a11y/click-events-have-key-events": "warn",
"jsx-a11y/no-static-element-interactions": "warn",
"jsx-a11y/heading-has-content": "warn",
"jsx-a11y/anchor-has-content": "warn",
```

The comment confirms these were downgraded because of existing violations rather
than being intentional design decisions.

**Fix:** Fix the existing violations and upgrade rules back to `"error"`.

### 9. Auth store duplicated between client and mobile

- `client/src/store/authStore.ts` (432 lines) + `authStore.api.ts`, `authStore.types.ts`, `authStore.utils.ts`
- `mobile/src/store/authStore.ts` — separate implementation

Both target Firebase Auth with overlapping user state management.

**Fix:** Extract shared auth types and logic into `packages/shared/auth/`.

---

## LOW Severity

### 10. `eslint-disable` suppressions (24 across 21 non-test files)

Most are in shadcn/ui components (`sidebar.tsx`, `toggle.tsx`, `badge.tsx`,
`button.tsx`, `form.tsx`) — typical for copy-pasted UI libraries. Only 2 actual
`@ts-expect-error` exist in production code, both documented.

**Status:** Acceptable. Monitor but no action needed.

### 11. `archive/` directory contains 775 lines of dead code

- `archive/functions-src/bounties/` — 733 lines (old bounty system)
- `archive/functions-src/ledger/writeTx.ts` — 42 lines

**Status:** Clearly marked as archived. Could be removed to reduce repo noise.

### 12. Raw `console.log` in production server files

- `server/services/moderationStore.ts` — 3 occurrences
- `client/src/lib/useSocket.ts` — 1 occurrence

Other occurrences in `server/logger.ts` and `server/config/env.ts` are acceptable
(logger bootstrap and config loading).

**Fix:** Replace with structured `logger` import.

### 13. Mobile has sparse test coverage

Mobile has ~12 test files vs. server's ~130+ and client's ~44. Large untested
components:
- `TrickRecorder.tsx` (824 lines) — no tests
- `AddSpotModal.tsx` — no tests
- `ResultScreen.tsx` — no tests

**Fix:** Add unit tests for core mobile components, starting with game-related ones.

### 14. pnpm engine version mismatch

- Root `package.json`: `"pnpm": ">=10.0.0"`
- `client/package.json`: `"pnpm": ">=9.0.0"`

Minor inconsistency that could allow different local environments.

**Fix:** Align all workspace packages to `"pnpm": ">=10.0.0"`.

---

## What's Working Well

- **Strict TypeScript** — `strict: true`, `noUnusedLocals`, `noUnusedParameters`,
  `@typescript-eslint/no-explicit-any: "error"` in production code
- **Strong CI** — 10 GitHub Actions workflows: lint, typecheck, build, test,
  CodeQL, gitleaks, secretlint, Firebase rules verification, smoke tests
- **Security posture** — Helmet, CSRF, rate limiting, App Check, MFA, replay
  protection, trust & safety middleware, audit logging, certificate pinning (mobile)
- **Server architecture** — Clean separation into `routes/`, `services/`,
  `middleware/`, `auth/`, `socket/`, `config/`
- **Zero TODO/FIXME/HACK comments** — No deferred-work markers
- **269 test files** — Extensive coverage across server and client
- **Tooling** — Husky + lint-staged + commitlint + prettier + eslint + secretlint
- **Database** — Drizzle ORM with typed schema, proper migration system, PostgreSQL

---

## Recommended Action Plan

### Phase 1: Fix broken/risky items (1-2 days)
1. Remove `web/package.json` COPY from Dockerfile
2. Rename `.env.staging` to `.env.staging.example`, add `.env.staging` to `.gitignore`
3. Renumber duplicate `0007` migration
4. Begin splitting `functions/src/index.ts` into modules

### Phase 2: Reduce drift risk (1-2 weeks)
5. Extract shared game logic into `packages/shared/game/`
6. Create typed mock factories to reduce `as any` in tests
7. Decompose largest files (start with game-related components)

### Phase 3: Polish (ongoing)
8. Replace raw `console.log` with structured logger
9. Add mobile component tests
10. Align pnpm engine versions
11. Fix a11y violations and upgrade lint rules to `"error"`
