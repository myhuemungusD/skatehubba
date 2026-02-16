# SkateHubba API System Security Audit

**Date:** 2026-02-16
**Scope:** Full server-side API layer — authentication, authorization, middleware, WebSocket, payments, database access, and configuration.
**Auditor:** Automated deep-dive code review

---

## Executive Summary

The SkateHubba API is **well-architected** with many security best practices already in place: bcrypt password hashing, session token hashing (SHA-256), TOTP MFA with AES-256-GCM encryption, timing-safe comparisons in critical paths, Zod input validation, OWASP-compliant CSRF protection, comprehensive rate limiting, audit logging, and replay protection for check-ins.

However, the audit identified **5 critical**, **6 high**, and **12 medium/low** findings that should be addressed.

---

## Findings

### CRITICAL

#### C1. CSRF Token Comparison Vulnerable to Timing Attack
- **File:** `server/middleware/csrf.ts:59`
- **Code:** `cookieToken !== headerToken`
- **Issue:** The CSRF double-submit cookie validation uses JavaScript's `===` operator, which leaks token bytes via timing side-channel. An attacker could brute-force the CSRF token byte-by-byte.
- **Fix:** Replace with `crypto.timingSafeEqual()`:
  ```ts
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
  ```

#### C2. Socket.io CORS Falls Back to Wildcard `*`
- **File:** `server/socket/index.ts:65`
- **Code:** `origin: process.env.ALLOWED_ORIGINS?.split(",") || "*"`
- **Issue:** When `ALLOWED_ORIGINS` is unset, Socket.io accepts connections from ANY origin. The HTTP CORS in `index.ts` properly uses an allowlist, but the WebSocket layer does not. This allows cross-site WebSocket hijacking.
- **Fix:** Mirror the HTTP CORS logic or default to `false` instead of `"*"`:
  ```ts
  origin: process.env.ALLOWED_ORIGINS?.split(",") || false,
  ```

#### C3. CSP `frameSrc` Directive Ignores Computed Firebase Domain
- **File:** `server/index.ts:47-68`
- **Issue:** Lines 47-54 compute a `frameSrcDirective` array with the Firebase Auth domain, but line 68 hardcodes `frameSrc: ["'none'"]` — the computed variable is never used. This will **break Firebase OAuth** in production (the auth iframe will be blocked by CSP).
- **Fix:** Replace line 68:
  ```ts
  frameSrc: frameSrcDirective,
  ```

#### C4. MFA Encryption Uses Shared JWT Secret with Static Salt
- **File:** `server/auth/mfa.ts:48`
- **Code:** `crypto.scryptSync(env.JWT_SECRET, "mfa-salt", 32)`
- **Issue:** MFA secrets are encrypted with a key derived from the JWT signing secret using a hardcoded string "mfa-salt". If the JWT secret is compromised (e.g., via a leaked `.env`), ALL MFA secrets can be decrypted. The salt should be unique per-record for defense in depth, or ideally a separate `MFA_ENCRYPTION_KEY` should be used.
- **Recommendation:** Add a dedicated `MFA_ENCRYPTION_KEY` environment variable. Consider using a random IV (already done) plus a per-user salt.

#### C5. No `trust proxy` Configuration
- **File:** `server/index.ts`
- **Issue:** Express is not configured with `app.set('trust proxy', ...)`. When deployed behind a reverse proxy, load balancer, or CDN (common in production), `req.ip` returns the proxy's IP — not the client's. This causes:
  - All rate limiters to share a single bucket (entire user base counts as one IP)
  - IP-based lockout to be ineffective or block all users at once
  - Audit logs to record wrong IPs
- **Fix:** Add near the top of `server/index.ts`:
  ```ts
  app.set('trust proxy', 1); // or set to specific proxy count/addresses
  ```

---

### HIGH

#### H1. `optionalAuthentication` Ignores Session Cookies
- **File:** `server/auth/middleware.ts:154-176`
- **Issue:** The `optionalAuthentication` middleware only checks the Authorization header — it completely ignores `req.cookies.sessionToken`. Users authenticated via session cookies (the primary auth method set during login) will appear unauthenticated on optional-auth routes.
- **Fix:** Add session cookie logic mirroring `authenticateUser`:
  ```ts
  const sessionToken = req.cookies?.sessionToken;
  if (sessionToken) {
    const user = await AuthService.validateSession(sessionToken);
    if (user?.isActive) { req.currentUser = { ...user, roles: [] }; }
  }
  ```

#### H2. User Search Exposes Email Addresses
- **File:** `server/routes.ts:477-506`
- **Issue:** The `/api/users/search` endpoint searches by email and returns email addresses to any authenticated user. This enables email enumeration/harvesting. The search also queries by email in the ILIKE clause.
- **Fix:** Remove `email` from the select and from the search condition. Users should be found by name only.

#### H3. Quick Match Leaks Firebase UID
- **File:** `server/routes.ts:619`
- **Code:** `opponentFirebaseUid: opponent.firebaseUid`
- **Issue:** The quick match response exposes the opponent's Firebase UID, which is an internal system identifier. This could be used for targeted attacks against the Firebase Auth system.
- **Fix:** Remove `opponentFirebaseUid` from the response.

#### H4. Password Change Missing Re-authentication Guard
- **File:** `server/auth/routes/password.ts:22`
- **Issue:** The `/api/auth/change-password` route uses `authenticateUser` but not `requireRecentAuth`. The project has a `requireRecentAuth` middleware specifically designed for sensitive operations. While the endpoint does require `currentPassword` for non-Firebase users, Firebase-authenticated users can change their password with only a session cookie (no re-verification — see `AuthService.changePassword` line 408: `user.passwordHash !== "firebase-auth-user"` skips password check).
- **Fix:** Add `requireRecentAuth` to the middleware chain.

#### H5. `logIPAddress` Middleware Mutates Request Body
- **File:** `server/middleware/security.ts:368`
- **Code:** `req.body.ipAddress = Array.isArray(ip) ? ip[0] : ip;`
- **Issue:** Injecting `ipAddress` into `req.body` can overwrite user-supplied data. If a client sends `{ "ipAddress": "spoofed" }`, the middleware replaces it, but this creates an unexpected coupling between middleware and route handlers. Could also conflict with Zod-validated bodies.
- **Fix:** Use `req.clientIp` or `res.locals.ipAddress` instead of mutating `req.body`.

#### H6. Lockout Service Fails Open on DB Error
- **File:** `server/auth/lockout.ts:91-97`
- **Issue:** When the database is unreachable, `checkLockout()` returns `isLocked: false` with full remaining attempts. This means during a DB outage, brute-force protection is completely disabled. The code documents this as intentional, but it should be monitored.
- **Recommendation:** Add alerting when this fallback triggers. Consider a conservative fail-closed mode or in-memory rate limiting as a secondary layer.

---

### MEDIUM

#### M1. Session Token TTL Mismatch
- **Files:** `server/auth/service.ts:18` (`TOKEN_EXPIRY = 24h`) vs `server/security.ts:6` (`SESSION_TTL = 7 days`)
- **Issue:** The actual session JWT expires in 24 hours, but `SECURITY_CONFIG.SESSION_TTL` claims 7 days. This is misleading and could cause bugs if any code references `SESSION_TTL` expecting it to match reality.
- **Fix:** Synchronize the constants.

#### M2. No Password Max Length Validation
- **Files:** `server/auth/routes/password.ts:32,126`
- **Issue:** Passwords are validated for min length (8) but not max length. bcrypt silently truncates input at 72 bytes. Two passwords that differ only after byte 72 would hash identically.
- **Fix:** Add `newPassword.length > 72` check or use a pre-hash (SHA-256 before bcrypt, as recommended by OWASP).

#### M3. Stripe Webhook Swallows Processing Errors
- **File:** `server/routes/stripeWebhook.ts:84-95`
- **Issue:** Application-level errors during webhook processing are caught, logged, and a `200 OK` is returned. If a premium upgrade fails (e.g., user record locked), Stripe won't retry — the user pays but doesn't get upgraded. Only `throw` for DB unavailable triggers a retry.
- **Fix:** Return 500 for retryable application errors. Implement idempotency tracking to safely allow retries.

#### M4. Swagger UI Publicly Accessible in Production
- **File:** `server/index.ts:113-124`
- **Issue:** API documentation at `/api/docs` is served without authentication, revealing the full API surface including admin endpoints, schemas, and error codes.
- **Fix:** Gate behind `authenticateUser` + `requireAdmin` in production, or disable entirely.

#### M5. No Expired Session Cleanup
- **Issue:** The `authSessions` table has no periodic cleanup of expired records. Over time, this table grows unboundedly.
- **Fix:** Add a cron job or scheduled task calling `DELETE FROM auth_sessions WHERE expires_at < NOW()`.

#### M6. `secureCompare` Leaks Length Information
- **File:** `server/security.ts:31`
- **Code:** `if (a.length !== b.length) return false;`
- **Issue:** The early return on length mismatch leaks string length via timing. This function isn't currently used in critical paths, but it's a footgun if someone uses it for token comparison.
- **Fix:** Pad both inputs to equal length before comparing, or document it as unsafe for secret comparison.

---

### LOW / INFORMATIONAL

#### L1. Helmet Not Applied in Development
- **File:** `server/index.ts:37`
- **Note:** Security headers (CSP, HSTS, X-Frame-Options) are only set in production. Development environments lack these protections. This is common practice but means dev/staging won't catch CSP issues until production.

#### L2. In-Memory Rate Limit Fallback in Multi-Process
- **Note:** When Redis is unavailable, all rate limiters fall back to in-memory stores. In a multi-process or load-balanced deployment, each process has its own counter — rate limits become per-process, not global. An attacker can multiply their allowed requests by the number of processes.

#### L3. Body Parse Limit at 10MB
- **File:** `server/config/server.ts:25`
- **Note:** The 10MB body limit is generous. Most API endpoints don't need more than a few KB. Consider lowering the global limit and setting higher limits only on endpoints that need it (avatar upload, video metadata).

#### L4. Bot User-Agent Filter Blocks Testing Tools
- **File:** `server/middleware/security.ts:343-344`
- **Note:** The `validateUserAgent` middleware blocks `curl`, `wget`, and `python` user agents. This would block legitimate API testing, CI health checks, and automated monitoring tools. This middleware is exported but not applied globally — verify it's not used on health check routes.

#### L5. IPv6 Validation Regex Incomplete
- **File:** `server/security.ts:39`
- **Note:** The IPv6 regex only matches fully-expanded 8-group addresses. Compressed forms (`::`), IPv4-mapped (`::ffff:127.0.0.1`), and zone IDs are not handled. Not currently used in critical paths.

#### L6. Dev Admin Bypass Relies Solely on NODE_ENV
- **File:** `server/auth/middleware.ts:39-67`
- **Note:** The `X-Dev-Admin: true` header bypass grants full admin access. It's gated on `NODE_ENV === "development" || "test"` which is correct, but if NODE_ENV is misconfigured in a deployment, this is catastrophic. Consider adding a second check (e.g., `DEV_BYPASS_ENABLED=true` environment variable).

---

## Positive Findings (Things Done Well)

| Area | Details |
|------|---------|
| **Password hashing** | bcrypt with 12 salt rounds |
| **Session storage** | Tokens stored as SHA-256 hashes, not raw JWTs |
| **MFA** | TOTP with AES-256-GCM encryption, timing-safe code verification, bcrypt-hashed backup codes |
| **CSRF** | OWASP Double Submit Cookie pattern correctly implemented |
| **Rate limiting** | 15+ rate limit configurations covering auth, writes, check-ins, admin, discovery |
| **Input validation** | Zod schemas on all write endpoints via `validateBody()` middleware |
| **SQL injection** | Drizzle ORM parameterized queries throughout; LIKE wildcards escaped |
| **Replay protection** | Nonce + timestamp verification on check-ins |
| **Audit logging** | Comprehensive login, MFA, password, and admin action tracking |
| **Sensitive data redaction** | Logger automatically redacts passwords, tokens, secrets, and emails |
| **Password reset** | Generic responses to prevent email enumeration |
| **Session invalidation** | All sessions revoked on password change/reset |
| **Cron auth** | Timing-safe cron secret verification |
| **Webhook auth** | Stripe signature verification before processing |
| **Account lockout** | 5-attempt lockout with 15-minute cooldown |
| **Email validation** | ReDoS-safe, RFC-compliant email regex |
| **Graceful shutdown** | SIGTERM/SIGINT handlers for clean WebSocket and Redis shutdown |

---

## Recommended Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| P0 (Deploy blocker) | C5: `trust proxy` | 1 line |
| P0 (Deploy blocker) | C3: CSP `frameSrc` bug | 1 line |
| P1 (Before launch) | C1: CSRF timing attack | 5 lines |
| P1 (Before launch) | C2: Socket.io wildcard CORS | 1 line |
| P1 (Before launch) | H2: Email exposure in user search | 5 lines |
| P1 (Before launch) | H3: Firebase UID leak in quick match | 1 line |
| P2 (Soon after launch) | C4: MFA encryption key separation | Medium |
| P2 (Soon after launch) | H1: Optional auth ignores cookies | 15 lines |
| P2 (Soon after launch) | H4: Password change re-auth guard | 1 line |
| P2 (Soon after launch) | M3: Stripe webhook error handling | Medium |
| P3 (Backlog) | All remaining medium/low findings | Various |

---

*End of audit report.*
