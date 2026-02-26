# Server Quality Review — Senior-Level Critique

**Date:** 2026-02-26
**Scope:** `server/` directory — Express API, WebSocket layer, auth, middleware, services, database
**Reviewer perspective:** Senior/Staff backend engineer

---

## Executive Summary

The SkateHubba server is a **well-structured, security-conscious Express application** that demonstrates genuine production awareness — Zod-validated environment config, CSRF double-submit tokens, bcrypt with 12 rounds, session token hashing, replay protection, circuit breakers, and structured logging with redaction. For a project at this stage, the security posture is above average.

That said, there are **architectural friction points, missing production hardening, and several patterns that would cause real pain at scale**. This review covers what's strong, what's concerning, and what to prioritize.

---

## Grade: B+

| Category | Grade | Notes |
|---|---|---|
| Security | A- | Strong fundamentals; a few gaps noted below |
| Architecture | B | Clear separation, but some structural debt |
| Error Handling | B+ | Consistent patterns, some inconsistencies |
| Database | B | Drizzle well-used; pool management is good; seeding is naive |
| Auth | A- | Dual-path (session + Firebase), lockout, MFA, re-auth |
| Observability | B+ | Good logging, metrics, health checks; missing tracing depth |
| Testing | A- | Extensive test files; quantity is strong |
| Resilience | B | Circuit breakers, graceful shutdown; some missing pieces |
| API Design | B- | Inconsistent response shapes; no versioning |
| WebSocket | B+ | Typed, auth'd, rate-limited; some concerns |

---

## What's Done Well

### 1. Security Fundamentals Are Solid
- **CSRF protection** via double-submit cookie with timing-safe HMAC comparison (`middleware/csrf.ts`) — correctly skips Bearer-token auth and safe methods.
- **Session tokens stored as SHA-256 hashes** in the database (`auth/service.ts:231`). Raw JWTs never persisted. This is a detail most teams miss.
- **bcrypt with 12 rounds** — appropriate cost factor.
- **Account lockout** (`auth/lockout.ts`) fails closed on DB errors — the correct design decision.
- **Replay protection** for check-ins with nonce + client timestamp + `SELECT FOR UPDATE` transactional safety.
- **Helmet CSP** in production with properly configured directives.
- **MFA_ENCRYPTION_KEY** separated from JWT_SECRET for defense-in-depth.
- **Password reset invalidates all sessions** — prevents session fixation after credential change.
- **Redis TLS enforcement** in production (`REDIS_URL` must be `rediss://`).
- **Log redaction** of sensitive keys (password, token, secret, email).

### 2. Environment Validation
- `config/env.ts` uses Zod schemas with meaningful error messages and **minimum length enforcement** on secrets (32 chars). The test-mode bypass is pragmatic and well-scoped.

### 3. Operational Maturity
- **Structured JSON logging** in production with hostname/PID/timestamp.
- **Health check differentiation**: `/api/health/live` (liveness), `/api/health/ready` (readiness), `/api/health` (strict), `/api/health/env` (diagnostics).
- **Request tracing** with `X-Request-ID` propagation.
- **Metrics middleware** with latency histograms, percentile calculation, and per-status-code counters.
- **Circuit breakers** on non-critical read paths (spots, stats, user discovery).
- **Graceful shutdown** with SIGTERM/SIGINT handlers that drain sockets, disconnect Redis, and close the HTTP server.

### 4. Rate Limiting Architecture
- **Centralized config** in `config/rateLimits.ts` with Redis-backed stores and automatic memory fallback.
- **Per-user key generation** using composite key (userId + device fingerprint + IP).
- **Layered limits**: global API limit, per-endpoint limits, per-user limits, socket connection limits.

---

## Critical Issues

### C1. `uncaughtException` handler continues execution

```typescript
// server/index.ts:113-118
process.on("uncaughtException", (err) => {
  logger.error("[Server] Uncaught exception — continuing", { ... });
});
```

**Problem:** After an uncaught exception, Node.js is in an **undefined state**. The official Node.js docs explicitly warn against continuing after `uncaughtException`. Corrupted state can cause silent data corruption, security bypasses, or resource leaks.

**Fix:** Log, flush, and exit. Let the process manager (Docker, systemd, k8s) restart the process.

```typescript
process.on("uncaughtException", (err) => {
  logger.fatal("[Server] Uncaught exception — shutting down", { ... });
  process.exit(1);
});
```

### C2. No password complexity enforcement

`auth/service.ts` hashes whatever password is provided. There's no minimum length, no complexity check, no breach-list lookup. `SECURITY_CONFIG.PASSWORD_MIN_LENGTH` exists (set to 8) but is **never enforced** in `createUser` or `resetPassword`.

**Fix:** Add Zod validation at the route level for all password-accepting endpoints. Consider integrating `zxcvbn` or a HaveIBeenPwned k-anonymity check.

### C3. Database seeding uses sequential inserts

```typescript
// db.ts:153-155
for (const step of defaultSteps) {
  await db.insert(schema.tutorialSteps).values(step);
}
```

Each seed record is a separate round-trip. With `defaultSpots` containing potentially hundreds of entries, this is O(n) network calls during startup. Under cold-start pressure (serverless, container restart), this adds seconds of latency.

**Fix:** Batch insert with `db.insert(schema.spots).values(allSpots)`.

### C4. `statement_timeout` set via string interpolation

```typescript
// db.ts:38
client.query(`SET statement_timeout = '${env.DB_STATEMENT_TIMEOUT_MS}'`)
```

While `env.DB_STATEMENT_TIMEOUT_MS` is Zod-validated as a number (so SQL injection is unlikely here), **the pattern is dangerous**. String interpolation in SQL is a habit that will eventually produce a vulnerability when copied to a less-validated context.

**Fix:** Use a parameterized query or at minimum `Number()` coercion with an explicit type assertion.

---

## Significant Issues

### S1. Inconsistent error response shapes

The codebase has three different error response patterns:
1. `utils/apiError.ts` — `{ error: "CODE", message: "...", details?: {} }` (the correct one)
2. Route handlers — `{ message: "..." }` (no error code)
3. Middleware — `{ error: "..." }` (no message field)

Example from `routes/spots.ts:99`:
```typescript
return res.status(404).json({ message: "Spot not found" });
```

But `utils/apiError.ts` defines `Errors.notFound()` which returns `{ error: "NOT_FOUND", message: "Resource not found." }`.

**Impact:** Frontend code must handle multiple shapes. Error monitoring can't reliably categorize errors.

**Fix:** Adopt `Errors.*` helpers everywhere. Lint for raw `res.status().json({ message })` calls.

### S2. `getUserDisplayName` is in `db.ts`

```typescript
// db.ts:100
export async function getUserDisplayName(db: Database, userId: string): Promise<string>
```

This is business logic living in the database connection module. It takes `db` as a parameter despite the module already exporting `db`. This signals a layering confusion.

**Fix:** Move to `services/userService.ts` or `services/profileService.ts`.

### S3. `AuthService` is a static class — untestable

Every method on `AuthService` is `static`, making it a glorified namespace. This means:
- **No dependency injection** — tests must mock module-level imports.
- **No interface** — can't substitute implementations.
- **Circular coupling** — `AuthService` imports `getDb()`, `admin`, `env` at module scope.

**Fix:** Convert to an instantiated service with constructor-injected dependencies. This is the single biggest testability improvement available.

### S4. Socket CORS config diverges from HTTP CORS

```typescript
// socket/index.ts:66-69
cors: {
  origin: process.env.ALLOWED_ORIGINS?.split(",") ||
    (process.env.NODE_ENV === "production" ? false : "*"),
```

The HTTP CORS in `app.ts` uses a callback function with `DEV_ORIGINS`. The socket CORS uses a simple split. If `ALLOWED_ORIGINS` is unset in dev, HTTP allows `DEV_ORIGINS` while sockets allow `*`. In production with no `ALLOWED_ORIGINS`, HTTP rejects (via callback), but sockets set `false` (which Socket.io interprets as "no CORS headers" — different behavior).

**Fix:** Extract a shared `getAllowedOrigins()` function (one already exists in `config/server.ts`) and use it in both places.

### S5. `logIPAddress` middleware manually parses `x-forwarded-for`

```typescript
// middleware/security.ts:362-366
const ip = req.headers["x-forwarded-for"] ||
  req.headers["x-real-ip"] ||
  req.connection.remoteAddress ||
  req.socket.remoteAddress;
```

But `app.ts` already sets `trust proxy: 1`, which means `req.ip` already contains the correct client IP. This manual parsing is redundant, inconsistent (doesn't respect the trust proxy setting), and could return a spoofed IP from an attacker-controlled `X-Forwarded-For` header.

**Fix:** Use `req.ip` everywhere. Delete `logIPAddress`.

### S6. Bot-blocking user-agent validation is too aggressive

```typescript
// middleware/security.ts:343
const botPatterns = [/bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i, /python/i];
```

This blocks:
- Legitimate monitoring tools (UptimeRobot, Pingdom, Datadog)
- CI/CD health checks
- Any client with "python" in the UA (legitimate API consumers, testing frameworks)
- Googlebot (you probably want SEO)

**Fix:** Remove this middleware entirely or replace with a configurable allowlist. Rate limiting and auth already handle abuse.

### S7. In-memory fallbacks will silently diverge in multi-instance deployments

The server correctly falls back to in-memory stores when Redis is unavailable:
- `recentAuthsFallback` in `auth/middleware.ts`
- `connectionAttemptsFallback` in `socket/auth.ts`
- `createMemoryReplayStore` in `services/replayProtection.ts`

**Problem:** Behind a load balancer with 2+ instances, each instance has its own memory. A user can bypass rate limits by hitting different instances. Re-auth state won't be found on a different instance. Replay protection nonces won't be shared.

**Fix:** This is acceptable for single-instance dev, but **log a warning at startup** if Redis is unavailable in production. Consider making Redis **required** in production mode.

---

## Moderate Issues

### M1. No API versioning

All routes are mounted at `/api/...` with no version prefix. When you need breaking changes, there's no path forward without breaking existing clients or implementing complex content negotiation.

**Fix:** Mount under `/api/v1/` now. It's nearly free to do early and expensive to retrofit.

### M2. `changePassword` creates a new session but doesn't return the token

```typescript
// auth/service.ts:469
await this.createSession(userId);
```

After deleting all sessions and creating a new one, the new session token is discarded. The caller has no way to set the new session cookie. The user will be logged out on the next request.

**Fix:** Return the new session token and set it as a cookie in the route handler.

### M3. `BODY_PARSE_LIMIT` is 10MB globally

```typescript
// config/server.ts:51
export const BODY_PARSE_LIMIT = "10mb";
```

Every POST/PUT endpoint accepts 10MB bodies by default. Most API endpoints need < 100KB. This is a vector for memory exhaustion under load.

**Fix:** Set a conservative global limit (e.g., 256KB) and use per-route overrides for upload endpoints.

### M4. `initializeDatabase` is called with top-level `await` at import time

```typescript
// index.ts:27
await initializeDatabase();
```

This blocks the entire server startup on seed completion. If the DB is slow or has hundreds of spots, the container health check may fail before the server starts listening.

**Fix:** Start listening first, then seed in the background. Mark the server as "not ready" via the readiness probe until seeding completes.

### M5. Audit logging is fire-and-forget to stdout only

`services/auditLog.ts` and `middleware/auditLog.ts` both log audit events via the logger (stdout/stderr). There's no durable audit trail — logs can be lost during container restarts, log rotation, or pipeline failures.

**Fix:** For compliance and incident response, write audit events to a dedicated database table or append-only log store (e.g., a Postgres `audit_events` table).

### M6. `isValidIP` doesn't handle real-world IPv6

```typescript
// security.ts:46-47
const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
```

This only matches the fully-expanded 8-group IPv6 form. It won't match:
- Compressed (`::1`, `fe80::1`)
- IPv4-mapped (`::ffff:192.168.1.1`)
- Link-local with zone ID (`fe80::1%eth0`)

**Fix:** Use Node.js `net.isIP()` instead.

### M7. Missing `return` before `next()` in some middleware

Several middleware functions call `next()` without `return`, which means code after the `next()` call could theoretically execute. While this doesn't cause bugs currently, it's a maintenance trap. Example in `middleware/security.ts:253`:

```typescript
next(); // no return — any code added below would execute
```

**Fix:** Always `return next()` in middleware for defensive safety.

---

## Minor Issues

### m1. Duplicate `packages` COPY in Dockerfile

```dockerfile
COPY --from=deps --chown=skatehubba:nodejs /app/packages ./packages  # line 43
COPY --chown=skatehubba:nodejs packages ./packages                   # line 46
```

The second COPY overwrites the first. This wastes build cache and layer space.

### m2. `connectedSockets` counter can drift

```typescript
// socket/index.ts:53,99,155
let connectedSockets = 0;
connectedSockets++;  // on connect
connectedSockets--;  // on disconnect
```

If `connect` fires without a corresponding `disconnect` (crash, timeout edge cases), the counter drifts permanently. Use `io.engine.clientsCount` or `(await io.fetchSockets()).length` for accuracy.

### m3. `DEV_ADMIN_BYPASS` check is in the auth middleware hot path

The dev-bypass check runs on every authenticated request in all environments, not just development. The `NODE_ENV` check prevents it from activating, but the branch is still evaluated.

### m4. `requireAdmin` verifies the Firebase token a second time

```typescript
// auth/middleware.ts:340-341
const token = authHeader.substring(7);
const decoded = await admin.auth().verifyIdToken(token);
```

`authenticateUser` already verified this token and extracted roles. The fallback re-verification in `requireAdmin` adds latency and a redundant Firebase call. If `authenticateUser` always populates `roles`, this fallback is dead code.

### m5. No request timeout middleware

There's no Express-level request timeout. A slow database query or external API call can hold a connection indefinitely, exhausting the connection pool.

**Fix:** Add `connect-timeout` middleware or implement a custom timeout wrapper.

### m6. `validateHoneypot` checks a field name that could conflict

The honeypot field is named `company`. If any legitimate form ever has a "company" field (e.g., business accounts, filmer profiles), this middleware will reject valid submissions.

---

## Architecture Observations

### Positive Patterns
- **Centralized config** (`config/env.ts`, `config/constants.ts`, `config/rateLimits.ts`, `config/server.ts`) — easy to find and change values.
- **Route decomposition** — `routes/games.ts` delegates to `games-challenges.ts`, `games-turns.ts`, etc. Good separation of concerns.
- **Service layer** exists (`services/`) and is generally used for business logic.
- **Shared schema package** (`@shared/schema`) — single source of truth for types and validation.
- **Middleware composition** in route definitions is readable and consistent.

### Structural Debt
- **Two audit systems**: `middleware/auditLog.ts` (middleware-based) and `services/auditLog.ts` (function-based). They use different types, different loggers, and different field names. Consolidate.
- **Two security modules**: `security.ts` (root-level constants + helpers) and `middleware/security.ts` (rate limiters + validators). The boundary is unclear.
- **Mixed auth model**: Firebase + custom JWT + session cookies creates a large surface area. Every auth path must be tested independently. Consider converging on one primary path.

---

## Recommendations (Priority Order)

1. **Fix `uncaughtException` handler** — exit instead of continuing (C1)
2. **Enforce password complexity** at route level (C2)
3. **Standardize error responses** — adopt `Errors.*` everywhere (S1)
4. **Unify CORS config** between HTTP and WebSocket (S4)
5. **Remove manual IP parsing** — use `req.ip` (S5)
6. **Add API versioning** — `/api/v1/` prefix (M1)
7. **Fix `changePassword` session token leak** (M2)
8. **Reduce global body parse limit** to 256KB (M3)
9. **Make Redis required in production** (S7)
10. **Add request timeout middleware** (m5)
11. **Batch database seeds** (C3)
12. **Consolidate audit logging** into a durable store (M5)
13. **Convert `AuthService` to instantiated class** for testability (S3)

---

*This review is based on a static read of the server source code. A runtime audit (load testing, penetration testing, dependency vulnerability scanning) would surface additional findings.*
