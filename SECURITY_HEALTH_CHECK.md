# Security Health Check Report

**Date:** 2026-02-06
**Scope:** Full-stack audit — server, client, Firestore rules, storage rules, dependencies, CI/CD

---

## Overall Grade: B+

The codebase has a strong security foundation with professional-grade authentication, comprehensive rate limiting, CSRF protection, and audit logging. Three issues were found and fixed in this review. A handful of lower-priority items remain as recommendations.

---

## Issues Found & Fixed

### 1. CRITICAL — Cron Endpoint Auth Bypass

**File:** `server/routes.ts:565-572`

The `/api/cron/forfeit-expired-games` endpoint only validated the `CRON_SECRET` when it was set. If the env var was missing, the endpoint was completely open to unauthenticated requests.

**Fix:** The endpoint now rejects all requests when `CRON_SECRET` is not configured.

### 2. CRITICAL — CORS Allowed All Origins in Non-Production

**File:** `server/index.ts:45-59`

The CORS policy had `process.env.NODE_ENV !== "production"` as a fallback, meaning any origin with credentials was accepted in development and staging environments.

**Fix:** Replaced the blanket allow with an explicit list of local dev origins (`localhost:5173`, `localhost:3000`, `localhost:5000`). Production uses `ALLOWED_ORIGINS` env var exclusively.

### 3. HIGH — CSP Allowed `unsafe-inline` for Scripts

**File:** `server/index.ts:30`

The Content-Security-Policy `scriptSrc` directive included `'unsafe-inline'`, which largely defeats CSP's XSS protection.

**Fix:** Removed `'unsafe-inline'` from `scriptSrc`. If inline scripts are needed, use nonce-based CSP instead.

---

## What's Working Well

| Area                      | Details                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| **Password Hashing**      | bcrypt with 12 salt rounds (`server/auth/service.ts:17`)                                           |
| **JWT Tokens**            | 24-hour expiry, unique JTI, sessions invalidated on password change                                |
| **MFA**                   | TOTP with AES-256-GCM encrypted secrets, bcrypt-hashed backup codes (`server/auth/mfa.ts`)         |
| **Account Lockout**       | 5 failed attempts → 15-minute lockout (`server/auth/lockout.ts`)                                   |
| **CSRF Protection**       | OWASP double-submit cookie pattern (`server/middleware/csrf.ts`)                                   |
| **Rate Limiting**         | Auth: 10/15min, password reset: 3/hr, API: 100/min, spots: 3/day (`server/middleware/security.ts`) |
| **Audit Logging**         | All auth events logged with IP, user-agent, timestamp (`server/auth/audit.ts`)                     |
| **SQL Injection**         | Drizzle ORM with parameterized queries throughout — no raw string interpolation                    |
| **XSS**                   | No `dangerouslySetInnerHTML`, no `eval()`, tokens in HttpOnly cookies                              |
| **Firestore Rules**       | Protected fields blocked, `.diff()` validation, deny-by-default                                    |
| **Storage Rules**         | File type + size limits (5MB profile, 10MB spot, 50MB upload)                                      |
| **Secret Scanning**       | Gitleaks + CodeQL in CI, `.env` files in `.gitignore`                                              |
| **Input Validation**      | Zod schemas on endpoints, ReDoS-safe email regex, honeypot fields                                  |
| **Dependency Management** | pnpm lockfile, `--frozen-lockfile` in CI, package validation script                                |

---

## Remaining Recommendations

### Medium Priority

| #   | Issue                                        | Location                             | Recommendation                                                                                                                                                                 |
| --- | -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ~~Hardcoded dev JWT secret~~                 | `server/config/env.ts`               | **FIXED** — `JWT_SECRET` is now required in all non-test environments with 32-character minimum. No fallback, no auto-generation. `MFA_ENCRYPTION_KEY` required in production. |
| 2   | `unsafe-inline` still in `styleSrc`          | `server/index.ts:31`                 | Move to nonce-based CSP for inline styles when feasible                                                                                                                        |
| 3   | ~~Missing `ALLOWED_ORIGINS` in env example~~ | `.env.example`                       | **FIXED** — `ALLOWED_ORIGINS` is present in `.env.example` and validated at runtime.                                                                                           |
| 4   | Hardcoded Firebase API key                   | `packages/config/src/firebase.ts:43` | Firebase web keys are public by design, but consider reading from env for consistency                                                                                          |

### Low Priority

| #   | Issue                                 | Location                                | Recommendation                                                     |
| --- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| 5   | Loose storage MIME matching           | `storage.rules:25-31`                   | Tighten to `image/(jpeg\|png\|webp)` and `video/(mp4\|webm)`       |
| 6   | Helmet not applied in dev             | `server/index.ts:24`                    | Apply CSP in all environments to catch issues early                |
| 7   | User-agent blocking may reject SDKs   | `server/middleware/security.ts:339-355` | The block on "python" and "curl" may reject legitimate API clients |
| 8   | Numeric param validation inconsistent | `server/routes.ts` (various)            | Standardize bounds checking on all numeric query params            |

---

## Methodology

- Static analysis of all server routes, middleware, auth modules
- Review of Firestore and Storage security rules
- Dependency and lock file inspection
- Search for hardcoded secrets, `eval()`, `dangerouslySetInnerHTML`, raw SQL
- Review of CI/CD security workflows (CodeQL, gitleaks, rules validation)
