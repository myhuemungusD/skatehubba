# Technical Debt Assessment (v2)

**Date:** 2026-02-24
**Scope:** Full monorepo audit — infrastructure, build, dependencies, server,
client, mobile, functions, packages, CI/CD, security, and testing.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 3     | Deploy blockers — broken Docker build, tsx in production, wrong Node target |
| HIGH     | 6     | God file, SDK version drift, env exposure, migration collision, turbo cache, outdated tsconfig |
| MEDIUM   | 14    | Type safety, code duplication, security gaps, dependency inconsistencies, CI waste |
| LOW      | 10    | Minor inconsistencies, polish, documentation gaps |

**Overall health:** The codebase is well-structured — strict TypeScript, strong CI
(10 workflows), good security posture, 269 test files, and zero TODO/FIXME markers.
The debt is manageable and none is architectural. The CRITICAL items should be
addressed before the next deploy.

---

## CRITICAL (Deploy Blockers)

### C1. Dockerfile references non-existent `web/` directory

```dockerfile
# Dockerfile:10
COPY web/package.json web/package.json
```

No `web/` directory exists in the repo. Docker builds fail at this step.

**Fix:** Delete line 10.

### C2. Dockerfile runs TypeScript at runtime via tsx

```dockerfile
# Dockerfile:62
CMD ["node", "--import", "tsx", "server/index.ts"]
```

The `esbuild.config.mjs` already compiles to `dist/server.js`, but the Docker
image never runs esbuild — it ships with `tsx` as a runtime dependency instead.
This means:
- Cold start penalty from tsx transpilation on every container boot
- tsx is a dev tool being used in production
- The esbuild config exists but is never exercised in the deploy path

**Fix:** Add `RUN pnpm -C server build` to the Docker build stage, then
change CMD to `["node", "dist/server.js"]`. Move tsx to devDependencies.

### C3. esbuild targets Node 18, monorepo requires Node 20+

- `esbuild.config.mjs:17` — `target: 'node18'`
- `package.json:8` — `"node": ">=20.0.0"`
- `Dockerfile:1` — `FROM node:20-slim`

Transpiles down to Node 18's feature set, missing Node 20 optimizations and
newer ES2023 features.

**Fix:** Change to `target: 'node20'`.

---

## HIGH Severity

### H1. `functions/src/index.ts` is a 1,118-line god file

All Cloud Functions live in one file: role management, S.K.A.T.E. game logic
(`submitTrick`, `judgeTrick`, vote timeouts), video transcoding, scheduled jobs,
rate limiting, transaction monitoring, and notification dispatch.

The in-memory rate limiter (`rateLimitStore = new Map<>()`) is ineffective — each
Cloud Function cold start gets a fresh Map. The code acknowledges this:

```
// Rate Limiting (In-Memory for single instance, use Redis for multi-instance)
```

**Fix:** Split into `functions/src/game/`, `functions/src/admin/`,
`functions/src/video/` (the `commerce/` subdirectory already shows the pattern).
Replace in-memory rate limiting with Firestore counters or Redis.

### H2. Firebase Admin SDK version mismatch

- `functions/package.json:21` — `"firebase-admin": "^12.0.0"`
- `server/package.json:27` — `"firebase-admin": "^13.0.0"`

There are breaking changes between v12 and v13 in auth token verification and
Firestore API. Functions and server talking to the same Firebase project with
different SDK versions can cause subtle interop issues.

**Fix:** Upgrade functions to `"firebase-admin": "^13.0.0"`.

### H3. `.env.staging` committed to git

The file header says _"NEVER commit this file with real secrets"_ but it IS
committed. `.gitignore` does not exclude `.env.staging`. While values are
currently empty, this pattern invites accidental secret commits and the
gitleaks scan won't flag empty templates.

**Fix:** Rename to `.env.staging.example`, add `.env.staging` to `.gitignore`.

### H4. Duplicate migration sequence `0007`

Two unrelated migrations share the `0007` prefix:

- `migrations/0007_add_notifications.sql`
- `migrations/0007_trickmint_video_pipeline.sql`

This causes non-deterministic ordering depending on filesystem sort order.
The `migrate.sh` script processes files alphabetically, so `_add_notifications`
runs before `_trickmint_video_pipeline`, but this is fragile.

**Fix:** Renumber `0007_trickmint_video_pipeline.sql` to `0011_*`.

### H5. Server Turbo cache output path mismatch

- `server/turbo.json:6` — `"outputs": ["../dist/server/**"]`
- `esbuild.config.mjs:8` — `outfile: 'dist/server.js'`

Turbo glob `../dist/server/**` expects files _inside_ a `server/` directory,
but esbuild produces `dist/server.js` (a file, not a directory). The glob never
matches, so every server build is a Turbo cache miss — even when nothing changed.

**Fix:** Change to `"outputs": ["../dist/server.js", "../dist/server.js.map"]`.

### H6. Functions tsconfig targets ES2017

- `functions/tsconfig.json:10` — `"target": "es2017"`
- `functions/package.json:15` — `"node": ">=18"` (supports ES2022)
- Rest of monorepo uses `"target": "ES2022"`

Functions compile to a JavaScript feature set from 2017, missing `Promise.allSettled`,
optional chaining output optimization, `Array.at()`, and other modern features that
Node 18+ supports natively.

**Fix:** Update `target` to `"es2022"`.

---

## MEDIUM Severity

### M1. ~2,200 `as any` casts in tests (160 files)

| Area | Occurrences | Files |
|------|-------------|-------|
| Server tests | ~1,424 | 135 |
| Functions tests | ~319 | 5 |
| Client tests | ~197 | 17 |

While tests are exempted from the strict `no-explicit-any` lint rule, pervasive
`as any` hides type mismatches between mocks and real implementations. When
interfaces change, tests won't catch the breakage at compile time.

Worst offenders:
- `functions/src/index.test.ts` — 136 occurrences
- `server/routes/__tests__/stripeWebhook.test.ts` — 65
- `server/__tests__/routes/routes-branches.test.ts` — 60
- `server/__tests__/routes/routes-edge-cases.test.ts` — 50+
- `server/__tests__/routes/games-disputes-routes.test.ts` — 55

**Fix:** Create typed mock factories (`createMockRequest()`, `createMockDb()`,
`createMockResponse()`) that return properly typed objects.

### M2. Game logic duplicated across 3 layers

The S.K.A.T.E. game state machine is implemented independently in three places:

1. `functions/src/index.ts` — Firestore-based (submitTrick, judgeTrick, vote timeouts)
2. `server/services/game/` — PostgreSQL-based (tricks.ts, forfeit.ts, timeouts.ts)
3. `client/src/lib/game/GameService.ts` — Firestore client-side transactions

Three separate implementations of letter tracking (`SKATE_LETTERS`), phase
transitions, and win conditions. Behavioral drift is likely.

**Fix:** Extract shared game constants and state transition logic into
`packages/shared/game/` consumed by all three layers.

### M3. 13 files exceed 500 lines

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

**Fix:** Decompose incrementally. Priority targets are game-related files
since they have the most cross-cutting logic.

### M4. Seven a11y lint rules weakened to warnings

```js
// eslint.config.mjs:86-93
// Accessibility (jsx-a11y) — warn for rules that have many existing violations
"jsx-a11y/no-autofocus": "warn",
"jsx-a11y/label-has-associated-control": "warn",
"jsx-a11y/media-has-caption": "warn",
"jsx-a11y/click-events-have-key-events": "warn",
"jsx-a11y/no-static-element-interactions": "warn",
"jsx-a11y/heading-has-content": "warn",
"jsx-a11y/anchor-has-content": "warn",
```

The comment confirms these were downgraded because of existing violations, not
intentional design decisions. Violations are accumulating.

**Fix:** Fix existing violations and upgrade rules back to `"error"`.

### M5. Inconsistent error response format across routes

`server/utils/apiError.ts` provides a standardized `Errors` utility, but many
routes use ad-hoc error responses instead:

```typescript
// Ad-hoc (inconsistent)
return res.status(500).json({ error: "Internal server error" });
```

Found in: `routes/matchmaking.ts`, `routes/games-turns.ts`, `routes/spots.ts`,
and others.

**Fix:** Standardize all routes to use the `Errors` utility.

### M6. Silent catch blocks in auth middleware

`server/auth/middleware.ts:169,176,193,198` — four empty `catch {}` blocks in
`optionalAuthentication()`:

```typescript
} catch {
  // Ignore session errors in optional mode, fall through to Bearer check
}
```

While "optional" auth intentionally continues on failure, zero logging makes
debugging auth issues invisible in production.

**Fix:** Add `logger.debug()` calls so auth failures appear in debug logs.

### M7. Missing rate limiting on dispute endpoints

`server/routes/games-disputes.ts:20,74` — POST `/api/games/:id/dispute` and
POST `/api/games/:id/dispute/:disputeId/resolve` lack rate limiters.

Other sensitive write endpoints (spots, ratings, profile) all have per-user
rate limiters. Disputes are missing.

**Fix:** Add dispute-specific rate limiters.

### M8. Audit logging is fire-and-forget

`server/routes/spots.ts:164,185` — `logAuditEvent({...})` calls are not awaited:

```typescript
logAuditEvent({
  action: "spot.created",
  userId: req.currentUser!.id,
  ...
});
// No await — continues immediately
```

If audit logging fails silently, the audit trail is incomplete. If the process
crashes before the async audit completes, events are lost.

**Fix:** Await audit logs, or implement a proper background queue.

### M9. Expo packages in root dependencies

`package.json:104-106` has Expo packages that are only used by mobile:

```json
"expo-auth-session": "~7.0.10",
"expo-crypto": "~15.0.8",
"expo-web-browser": "~15.0.10",
```

These belong in `mobile/package.json`, not the workspace root.

**Fix:** Move to mobile or remove if unused.

### M10. Firebase client SDK version inconsistency

- `client/package.json:53` — `"firebase": "^11.0.2"`
- `mobile/package.json:48` — `"firebase": "^11.2.0"`
- `packages/config/package.json` — `"firebase": "^11.2.0"`

Different minimum versions across packages sharing the same Firebase project.

**Fix:** Align all to `"^11.2.0"`.

### M11. React version inconsistency

- `client/package.json:58` — `"react": "^18.2.0"`
- `mobile/package.json:50` — `"react": "^18.3.1"`

**Fix:** Align to `"^18.3.1"`.

### M12. Client/mobile auth store duplication

- `client/src/store/authStore.ts` (432 lines) + api/types/utils files
- `mobile/src/store/authStore.ts` — separate implementation

Both target Firebase Auth with overlapping user state management, token handling,
and profile data. Changes to auth flow must be made in two places.

**Fix:** Extract shared auth types/logic into `packages/shared/auth/`.

### M13. Bundle size CI job rebuilds client redundantly

`ci.yml:110-113` — The `bundle_size` job depends on `lockfile_check` only:

```yaml
bundle_size:
  needs: lockfile_check  # Should depend on build_lint_typecheck
```

This means it rebuilds the client from scratch instead of downloading the
artifact already produced by `build_lint_typecheck`. Wastes ~2-3 min per CI run.

**Fix:** Change to `needs: [build_lint_typecheck]` and download the build artifact.

### M14. Firebase placeholder env vars duplicated 3x in CI

`ci.yml:67-72, 77-82, 127-133` — identical Firebase placeholder vars copy-pasted
across three job steps:

```yaml
EXPO_PUBLIC_FIREBASE_API_KEY: ci-placeholder
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: ci-placeholder.firebaseapp.com
# ... repeated 3 times
```

**Fix:** Define once in a workflow-level `env:` block.

---

## LOW Severity

### L1. `eslint-disable` suppressions (24 across 21 files)

Mostly in shadcn/ui components (`sidebar.tsx`, `toggle.tsx`, `badge.tsx`,
`button.tsx`, `form.tsx`). Only 2 `@ts-expect-error` in production code, both
documented. Acceptable — no action needed.

### L2. `archive/` dead code (775 lines)

- `archive/functions-src/bounties/` — 733 lines (old bounty system)
- `archive/functions-src/ledger/writeTx.ts` — 42 lines

Clearly marked as archived. Could be removed to reduce repo noise.

### L3. Raw `console.log` in production server files

- `server/services/moderationStore.ts` — 3 occurrences
- `client/src/lib/useSocket.ts` — 1 occurrence

Other occurrences in `server/logger.ts` and `server/config/env.ts` are acceptable
(logger bootstrap and config loading).

**Fix:** Replace with structured `logger` import.

### L4. Mobile has sparse test coverage

~12 test files vs. server's ~130+ and client's ~44. Large untested components:
- `TrickRecorder.tsx` (824 lines)
- `AddSpotModal.tsx`
- `ResultScreen.tsx`
- `GameActionArea.tsx`

**Fix:** Add unit tests for core mobile components.

### L5. pnpm engine version mismatch

- Root: `"pnpm": ">=10.0.0"` | Client: `"pnpm": ">=9.0.0"`

**Fix:** Align to `">=10.0.0"`.

### L6. Functions tsconfig missing strictness flags

`functions/tsconfig.json` has `strict: true` and `noUnusedLocals: true` but
missing `noUnusedParameters` and `noFallthroughCasesInSwitch` (both present in
the root tsconfig).

**Fix:** Add the missing flags.

### L7. moduleResolution inconsistency across tsconfigs

| Config | Value |
|--------|-------|
| Root | `"bundler"` (lowercase) |
| Server | `"Bundler"` (capitalized) |
| Mobile | `"node"` (intentional for RN) |
| Functions | none (defaults to `"node"`) |

TypeScript is case-insensitive here, but inconsistent styling.

### L8. pnpm overrides lack documentation

`package.json:86-95` — 8 dependency overrides with no comments explaining why
they exist or what CVEs they mitigate:

```json
"overrides": {
  "drizzle-zod": "0.7.0",
  "path-to-regexp": ">=8.0.0",
  "cookie": ">=0.7.0",
  "send": ">=0.19.0",
  "serve-static": ">=1.16.0",
  "glob": ">=10.4.0",
  "detox>glob": "8.1.0",
  "rimraf": ">=5.0.0"
}
```

**Fix:** Add inline comments documenting the reason for each override.

### L9. Socket event listener cleanup

`server/socket/index.ts` — Handler registration functions
(`registerPresenceHandlers`, `registerBattleHandlers`, `registerGameHandlers`)
don't return cleanup functions. Socket.io handles disconnect cleanup
automatically for most cases, but custom timers/intervals inside handlers may
not be cleaned up properly.

### L10. Dependabot alerts active

GitHub reports 9 vulnerabilities on the default branch:
- 1 critical
- 4 high
- 3 moderate
- 1 low

**Fix:** Review and remediate at
`github.com/myhuemungusD/skatehubba/security/dependabot`.

---

## What's Working Well

- **Strict TypeScript** — `strict: true`, `noUnusedLocals`, `noUnusedParameters`,
  `@typescript-eslint/no-explicit-any: "error"` in production code
- **Strong CI** — 10 GitHub Actions workflows: lint, typecheck, build, test,
  CodeQL, gitleaks, secretlint, Firebase rules, migration drift, smoke tests
- **Security posture** — Helmet, CSRF protection, rate limiting, App Check, MFA,
  replay protection, trust & safety middleware, audit logging, certificate pinning
  (mobile), session management with bcrypt
- **Server architecture** — Clean separation: `routes/`, `services/`,
  `middleware/`, `auth/`, `socket/`, `config/`
- **Zero TODO/FIXME/HACK comments** — No deferred-work markers anywhere
- **269 test files** — Extensive coverage across server and client
- **Tooling** — Husky + lint-staged + commitlint + prettier + eslint + secretlint
- **Database** — Drizzle ORM with typed schema, PostgreSQL, migration drift CI
  check, connection pool tuning, statement timeouts
- **Dependabot** — Active scanning with automatic alerts
- **Bundle size budget** — CI enforces bundle size limits to prevent bloat
- **Mobile security** — Certificate pinning, device integrity checks (jail-monkey),
  App Check integration

---

## Recommended Action Plan

### Phase 1: Fix deploy blockers (CRITICAL)
1. Delete `web/package.json` COPY from `Dockerfile:10`
2. Add `RUN pnpm -C server build` to Docker, change CMD to `dist/server.js`
3. Update `esbuild.config.mjs` target from `node18` to `node20`

### Phase 2: Fix high-risk items (HIGH)
4. Upgrade `functions/package.json` firebase-admin to `^13.0.0`
5. Rename `.env.staging` → `.env.staging.example`, update `.gitignore`
6. Renumber duplicate `0007` migration
7. Fix server Turbo cache output path
8. Update `functions/tsconfig.json` target to `es2022`
9. Begin splitting `functions/src/index.ts` into modules

### Phase 3: Reduce drift and security gaps (MEDIUM)
10. Extract shared game logic into `packages/shared/game/`
11. Create typed mock factories to reduce `as any` in tests
12. Add rate limiting to dispute endpoints
13. Standardize error responses using `Errors` utility
14. Fix silent catch blocks in auth middleware
15. Align Firebase/React version inconsistencies
16. Deduplicate CI env vars, fix redundant bundle size rebuild
17. Move Expo packages from root to mobile dependencies

### Phase 4: Polish (LOW)
18. Replace raw `console.log` with structured logger
19. Add mobile component tests
20. Align pnpm engine versions
21. Document pnpm overrides with CVE references
22. Add missing strictness flags to functions tsconfig
23. Fix a11y violations and upgrade lint rules to `"error"`
24. Address Dependabot alerts
