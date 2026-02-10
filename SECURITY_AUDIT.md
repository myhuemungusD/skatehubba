# SkateHubba API Security Audit

**Date:** 2026-02-10
**Scope:** Full API surface — authentication, authorization, input validation, rate limiting, transport security, database access, WebSocket, payments, configuration
**Methodology:** Manual static analysis of all server-side code

---

## Executive Summary

The SkateHubba API demonstrates solid security fundamentals: Firebase-backed auth, HttpOnly session cookies, CSRF double-submit pattern, Zod input validation, bcrypt password hashing, Stripe webhook signature verification, and audit logging. However, the audit identified **4 critical**, **6 high**, and **10+ medium/low** findings that should be addressed before production deployment.

---

## Critical Findings

### C1. Payment Intent Reuse — Premium Upgrade Fraud

**File:** `server/routes/tier.ts:248-249`
**Severity:** CRITICAL

The `/api/tier/purchase-premium` endpoint verifies a Stripe PaymentIntent's status and amount but never records that the intent was consumed. An attacker can take a single successful $9.99 payment and replay the same `paymentIntentId` to upgrade multiple accounts to Premium.

```ts
// Line 248-249: TODO comment acknowledges the gap
// Optional: Verify this payment hasn't been used before
// You might want to store processed payment intent IDs to prevent reuse
```

**Recommendation:** Store processed PaymentIntent IDs in a `processedPayments` table with a unique constraint. Check for existence before granting premium. Alternatively, rely exclusively on the webhook flow (`checkout.session.completed`) which already has idempotency via the `user.accountTier === "premium"` guard.

---

### C2. User Enumeration — Bulk Email & Firebase UID Disclosure

**File:** `server/routes.ts:500-522`
**Severity:** CRITICAL

The `GET /api/users` endpoint returns `email` and `firebaseUid` for all active users to any authenticated user. This enables bulk harvesting of every user's email address and Firebase UID.

```ts
// Line 507-512
const results = await database
  .select({
    uid: customUsers.firebaseUid,  // Leaks Firebase UID
    email: customUsers.email,       // Leaks email
    displayName: customUsers.firstName,
    photoURL: sql<string | null>`null`,
  })
  .from(customUsers)
  .where(eq(customUsers.isActive, true))
  .limit(100);
```

**Recommendation:** Remove `email` and `firebaseUid` from the response. Return only opaque user IDs and display names. Apply the same filtering used in `/api/users/search` (which correctly maps to non-sensitive fields).

---

### C3. Dev/Staging Auth Bypass — Mock Tokens and Admin Header

**Files:** `server/auth/middleware.ts:38-64`, `server/auth/routes/login.ts:36-59`
**Severity:** CRITICAL (if any non-localhost deployment uses NODE_ENV !== "production")

Two bypass mechanisms exist for development:

1. **`x-dev-admin` header** grants full admin access when `NODE_ENV !== "production"` (middleware.ts:39)
2. **Mock tokens** (`mock-google-token`, `mock-token`) authenticate as hardcoded users when `NODE_ENV !== "production"` (login.ts:36-47)

If a staging, preview, or QA deployment is reachable without `NODE_ENV=production`, an attacker gets instant admin access via a single header.

**Recommendation:** Gate these bypasses on `NODE_ENV === "development"` **AND** a secondary check (e.g., `process.env.ALLOW_DEV_AUTH === "true"`) or restrict to localhost only. Add a startup warning if these are active.

---

### C4. Hardcoded JWT Secret Fallback

**File:** `server/config/env.ts:12-24`
**Severity:** CRITICAL (if deployed without JWT_SECRET in non-production)

When `JWT_SECRET` is not set and `NODE_ENV` is not `"production"`, the secret falls back to `"dev-jwt-secret-change-in-production-32chars"`. Any attacker who knows this string can forge valid JWTs for any user.

```ts
return val || "dev-jwt-secret-change-in-production-32chars";
```

**Recommendation:** Remove the hardcoded fallback. Require `JWT_SECRET` in all environments, or generate a random ephemeral secret at startup with a loud warning.

---

## High Findings

### H1. Session Tokens Stored in Plaintext

**File:** `server/auth/service.ts:233-243`
**Severity:** HIGH

JWT session tokens are stored verbatim in the `authSessions` table. A database leak (SQL injection, backup exposure, compromised access) instantly yields all active sessions that can be used to impersonate users.

**Recommendation:** Store a SHA-256 hash of the token in the database. On validation, hash the incoming token and compare against the stored hash.

---

### H2. Admin Auth Fails for Cookie-Authenticated Users

**File:** `server/auth/middleware.ts:295-326`
**Severity:** HIGH

The `requireAdmin` middleware checks Firebase custom claims via the `Authorization: Bearer` header (line 302-308). If an admin user authenticated via the session cookie path (the preferred path), no `Authorization` header is present, and the middleware always returns 403 — effectively locking admins out of admin endpoints when using cookie auth.

**Recommendation:** When no Authorization header is present, check admin status from the `req.currentUser.roles` array (which is populated during cookie-based auth at line 84-93 in the same file).

---

### H3. User Search Wildcard Injection

**File:** `server/routes.ts:466`
**Severity:** HIGH

The `/api/users/search` endpoint does not escape SQL LIKE wildcards before constructing the search term:

```ts
const searchTerm = `%${query}%`;
```

A search for `%` or `_` returns unintended result sets. Combined with the 20-result limit this is bounded, but it enables enumeration. Notably, the admin user search at `admin.ts:89` correctly escapes these characters.

**Recommendation:** Apply the same wildcard escaping used in admin.ts:
```ts
const sanitizedSearch = query.replace(/[%_\\]/g, (c) => `\\${c}`);
```

---

### H4. Unlimited Pro Award Chain

**File:** `server/routes/tier.ts:35`
**Severity:** HIGH

Any Pro/Premium user can award Pro status to unlimited free users via `/api/tier/award-pro`. Newly promoted Pro users can immediately award Pro to others, creating an exponential chain. A single compromised Pro account can promote the entire userbase.

**Recommendation:** Add per-user award limits (e.g., 3 Pro awards per month) tracked in a dedicated table. Consider requiring admin approval or a cooldown period for newly-promoted Pro users.

---

### H5. No Rate Limiting on Sensitive Endpoints

**File:** `server/routes.ts` (various)
**Severity:** HIGH

Several write endpoints rely only on the global 100/min API limiter, which is too generous for abuse-sensitive operations:

| Endpoint | Risk |
|---|---|
| `POST /api/matchmaking/quick-match` | Spam push notifications to random users |
| `POST /api/spots/:spotId/rate` | Manipulate spot ratings (no per-user dedup) |
| `GET /api/spots/discover` | Hammer the OSM Overpass API externally |
| `POST /api/tier/award-pro` | Mass-promote users |

**Recommendation:** Add per-user or per-endpoint rate limiters matching the sensitivity of each operation.

---

### H6. Spot Rating Has No Per-User Deduplication

**File:** `server/routes.ts:182-204`
**Severity:** HIGH

The `POST /api/spots/:spotId/rate` endpoint calls `spotStorage.updateRating()` without tracking who rated. A single user can call this endpoint repeatedly to manipulate a spot's average rating.

**Recommendation:** Store individual ratings per user per spot. Reject or update duplicate ratings from the same user.

---

## Medium Findings

### M1. Firebase Token Revocation Check Skipped at Login

**File:** `server/auth/routes/login.ts:58`
**Severity:** MEDIUM

The login endpoint calls `verifyIdToken(idToken)` without the `checkRevoked` parameter (second arg = `true`), while the `authenticateUser` middleware correctly uses `verifyIdToken(token, true)`. This means a revoked Firebase token can still be used to create a new session.

**Recommendation:** Change to `verifyIdToken(idToken, true)` for consistency.

---

### M2. `optionalAuthentication` Ignores Session Cookies

**File:** `server/auth/middleware.ts:151-173`
**Severity:** MEDIUM

The `optionalAuthentication` middleware only checks the `Authorization` header. Users authenticated via the `sessionToken` cookie (the primary auth method) are not recognized on endpoints using this middleware.

**Recommendation:** Mirror the cookie-checking logic from `authenticateUser` in `optionalAuthentication`.

---

### M3. Quick Match Leaks Firebase UID

**File:** `server/routes.ts:592-598`
**Severity:** MEDIUM

The quick match response includes `opponentFirebaseUid`, which is a platform-internal identifier that should not be exposed to clients.

**Recommendation:** Remove `opponentFirebaseUid` from the response. Return only the opaque `opponentId`.

---

### M4. Helmet Disabled Outside Production

**File:** `server/index.ts:31`
**Severity:** MEDIUM

Security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.) are only applied when `NODE_ENV === "production"`. Any staging or preview deployment lacks these protections.

**Recommendation:** Apply Helmet in all environments with an appropriately relaxed CSP for development.

---

### M5. IP Spoofing via X-Forwarded-For

**Files:** `server/routes.ts:372-388`, `server/middleware/security.ts:309-319`
**Severity:** MEDIUM

Client IP is extracted from `x-forwarded-for` / `x-real-ip` headers without `app.set('trust proxy', ...)`. Without Express's trust proxy configuration, an attacker can spoof their IP to bypass all IP-based rate limiting.

**Recommendation:** Configure `app.set('trust proxy', <appropriate value>)` based on deployment topology (e.g., `1` for single reverse proxy, or the proxy's IP range).

---

### M6. No Password Length Upper Bound

**File:** `server/auth/routes/password.ts:28, 115`
**Severity:** MEDIUM

Password validation enforces a minimum of 8 characters but no maximum. While bcrypt truncates at 72 bytes, hashing a multi-megabyte password string burns CPU time, enabling a targeted DoS.

**Recommendation:** Add a maximum password length (e.g., 128 characters).

---

### M7. Notification Pagination Allows Negative Offset

**File:** `server/routes/notifications.ts:230`
**Severity:** MEDIUM

```ts
const offset = parseInt(String(req.query.offset)) || 0;
```

`parseInt("-5")` returns -5, not 0. A negative offset passed to PostgreSQL causes an error. Use `Math.max(0, ...)` or validate with Zod like the TrickMint feed does.

---

### M8. TrickMint Submit Accepts Arbitrary Video URLs

**File:** `server/routes/trickmint.ts:88`
**Severity:** MEDIUM

The `POST /api/trickmint/submit` endpoint validates `videoUrl` as any valid URL (`z.string().url()`). There's no validation that the URL points to the project's Firebase Storage bucket, allowing linking to arbitrary external content or potential SSRF if the URL is fetched server-side later.

**Recommendation:** Validate that `videoUrl` starts with the project's Firebase Storage URL prefix.

---

### M9. `logIPAddress` Middleware Contaminates Request Body

**File:** `server/middleware/security.ts:317`
**Severity:** LOW

```ts
req.body.ipAddress = Array.isArray(ip) ? ip[0] : ip;
```

Injecting data into `req.body` can conflict with user-supplied fields or bypass validation schemas that run before this middleware.

**Recommendation:** Use `req.clientIp` or a custom property on the request object instead.

---

### M10. No Session Cleanup Job

**Severity:** LOW

Expired rows in the `authSessions` table are never deleted. This table will grow indefinitely.

**Recommendation:** Add a scheduled cleanup job (similar to `LockoutService.cleanup()`) to purge expired sessions.

---

## Positive Observations

The following security measures are well-implemented:

- **CSRF:** Double-submit cookie pattern applied globally to `/api` with correct Bearer-token bypass
- **Password security:** bcrypt with 12 rounds, password reset invalidates all sessions
- **MFA:** TOTP with backup codes, requires current code to disable
- **Stripe webhooks:** Signature verification via `constructEvent()`, raw body parsing, correct bypass of auth/CSRF
- **Replay protection:** Nonce + timestamp validation for check-ins
- **Game state integrity:** Database row-level locking (`SELECT ... FOR UPDATE`) prevents race conditions
- **Cron authentication:** Timing-safe comparison for cron secrets
- **Audit logging:** Comprehensive logging of auth events, lockouts, check-ins
- **Account lockout:** Progressive lockout after failed attempts
- **Input validation:** Zod schemas on most write endpoints
- **ReDoS-safe email regex:** Carefully crafted to avoid catastrophic backtracking
- **Cookie security:** HttpOnly, Secure (in prod), SameSite=Lax, path-scoped
- **Socket auth:** Rate limiting + Firebase token verification on WebSocket connections
- **Admin routes:** Layered middleware (auth + admin check + rate limit + ban check)
- **Error messages:** Generic auth errors prevent information leakage

---

## Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| **P0** | C1: Payment intent reuse | Low — add processed payments table |
| **P0** | C2: User email/UID disclosure | Low — remove fields from response |
| **P0** | C3: Dev auth bypass in staging | Low — tighten environment check |
| **P0** | C4: Hardcoded JWT fallback | Low — require secret in all envs |
| **P1** | H1: Plaintext session tokens | Medium — hash tokens on write/read |
| **P1** | H2: Admin cookie auth broken | Low — check roles from currentUser |
| **P1** | H4: Unlimited pro awards | Low — add award count tracking |
| **P1** | H5: Missing rate limits | Low — add per-endpoint limiters |
| **P1** | H6: Rating deduplication | Medium — add user-spot-rating table |
| **P2** | H3: Search wildcard escape | Low — copy admin.ts pattern |
| **P2** | M1: Token revocation at login | Low — add `true` parameter |
| **P2** | M2: Optional auth cookie | Low — add cookie check |
| **P2** | M5: Trust proxy config | Low — one line change |
| **P2** | M6: Password max length | Low — add `.max(128)` |
| **P3** | M3-M4, M7-M10 | Low |
