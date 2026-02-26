# Security Review Notes for SkateHubba

**Last Updated:** 2026-02-26
**Current Security Grade:** A- (full E2E audit 2026-02-24)

---

## Current Security Posture

SkateHubba has undergone 4 security audit passes (Feb 6, 12, 18, 24) with 44 findings identified and remediated. The platform demonstrates mature security practices across all layers.

---

## Resolved Issues

### 1. CSP `unsafe-inline` for Scripts (CRITICAL — FIXED 2026-02-06)

**File**: `server/security.ts` (previously `server/index.js`)
**Issue**: Content Security Policy allowed `'unsafe-inline'` for scripts.
**Resolution**: Removed `'unsafe-inline'` from `scriptSrc`. Only `'self'` remains.

### 2. Dual Database Initialization (MEDIUM — FIXED)

**Files**: `server/index.js`, `server/routes.ts`
**Issue**: Database initialized twice during startup.
**Resolution**: Removed redundant call from `registerRoutes`.

### 3. Global Mutable Service Singletons (MEDIUM — ACCEPTED)

**File**: `server/routes.ts`
**Issue**: `let stripe: Stripe | null = null` and `let openai: OpenAI | null = null` as global mutable state.
**Decision**: Accepted — lazy initialization pattern is standard for optional service clients. Testing uses dependency injection where needed.

---

## Open Items

### 1. `unsafe-inline` in `styleSrc` (LOW)

**File**: `server/security.ts`
**Status**: DEFERRED — pending CSS-in-JS migration or nonce-based approach.

```javascript
styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]
```

The `scriptSrc` has been hardened (no `unsafe-inline`), which is the critical vector. Style-based attacks are significantly more limited in scope.

**Remediation options** (when ready):
1. Nonce-based CSP for inline styles (requires build tooling changes)
2. Extract all inline styles to external stylesheets
3. `strict-dynamic` with nonces for modern browsers

---

## Security Controls Implemented

### Authentication & Session Management

- **Password hashing:** bcrypt with 12 salt rounds
- **JWT tokens:** 24-hour expiry, unique JTI, sessions invalidated on password change
- **Session storage:** SHA-256 hashed tokens (not raw JWTs)
- **MFA:** TOTP with AES-256-GCM encrypted secrets, bcrypt-hashed backup codes, dedicated encryption key in production
- **Account lockout:** 5 failed attempts → 15-minute cooldown (per-email + per-IP)
- **Re-authentication:** 5-minute window for sensitive operations (password, MFA, deletion)
- **Firebase token verification:** Revocation check enabled (`verifyIdToken(token, true)`)

### Input Validation & Injection Prevention

- **Zod schemas:** All write endpoints validated via `validateBody()` middleware
- **Drizzle ORM:** Parameterized queries throughout — no raw SQL string interpolation
- **XSS prevention:** No `dangerouslySetInnerHTML`, no `eval()`, tokens in HttpOnly cookies
- **URL validation:** HTTPS-only for media URLs, whitelist for payment redirects
- **WebSocket validation:** Strict `safeId` regex patterns for all IDs

### Network Security

- **CSRF protection:** OWASP Double Submit Cookie with HMAC-normalized timing-safe comparison
- **Rate limiting:** 15+ configurations across auth, API, WebSocket, admin, discovery, cron
- **CSP:** Strict policy — no `unsafe-inline` for scripts, restricted `connect-src`, `frame-src` limited to Firebase OAuth
- **CORS:** Explicit origin whitelist in production; restricted dev origins
- **Trust proxy:** Set to 1 for accurate client IP behind load balancers
- **Permissions-Policy:** Restricts camera, microphone, geolocation, payment, USB, sensors

### Data Protection

- **Sensitive data redaction:** Logger auto-redacts passwords, tokens, secrets, emails
- **Email enumeration prevention:** Generic responses on password reset
- **Session invalidation:** All sessions revoked on password change/reset
- **Profile caching:** Only non-sensitive status data in sessionStorage; full profile in memory only

### Payments

- **Webhook authentication:** Stripe signature verification before processing
- **Payment idempotency:** `consumedPaymentIntents` with `SELECT FOR UPDATE` in transaction
- **Currency validation:** Enforces USD only
- **Redirect validation:** Whitelist (`checkout.stripe.com` only)
- **Price validation:** Extracted to `PREMIUM_PRICE_CENTS` and `PREMIUM_CURRENCY` constants

### Infrastructure

- **Docker:** Non-root user `skatehubba:1001`, Node.js 22-slim base image, healthcheck with timeout
- **CI/CD:** Gitleaks + CodeQL + Trivy + lockfile integrity + Firebase rules validation
- **Secret scanning:** Multi-tool (Secretlint, Gitleaks, detect-secrets, ggshield)
- **Dependencies:** pnpm with `--frozen-lockfile` in CI, Dependabot for weekly updates
- **GitHub Actions:** Pinned to specific versions/SHAs

### Firebase

- **Firestore rules:** Default-deny, helper functions, environment isolation, field validation, timestamp verification
- **Storage rules:** Size limits per path, content-type enforcement, owner-bound writes for sensitive paths
- **App Check:** Gradual rollout (monitor → warn → enforce) with strict option for sensitive endpoints

---

## Pre-Production Checklist (Updated 2026-02-26)

- [x] **Remove `unsafe-inline` from CSP scripts** — Fixed 2026-02-06
- [x] **Set secure session secrets** — JWT_SECRET enforced at boot with 32-char minimum
- [x] **Use production Stripe keys** — Validated via `sk_` prefix check
- [x] **Enable HTTPS-only cookies** — HttpOnly + Secure flags in production
- [x] **Set NODE_ENV=production** — Enforced in deployment config
- [x] **Review CORS origins** — Explicit whitelist via `ALLOWED_ORIGINS` env var
- [x] **Enable rate limiting** — 15+ configurations active
- [x] **Add request logging** — Comprehensive audit logging with dual storage
- [x] **Review database connection limits** — Configured via env vars
- [x] **Set up error monitoring** — Sentry configured and active
- [x] **Firestore rules validated in CI** — PR + main branch triggers
- [x] **Secret scanning in CI** — Gitleaks + CodeQL on all pushes/PRs
- [x] **Node.js 22 LTS** — Upgraded from Node 20
- [ ] **`unsafe-inline` in styleSrc** — Deferred (low priority)
- [ ] **Docker image signing** — Recommended for A08 compliance
- [ ] **Certificate pinning (mobile)** — In backlog

---

## Compliance Status

### OWASP Top 10 (2021) — 9/10 Pass

| Category | Status |
| -------- | ------ |
| A01: Broken Access Control | **Pass** |
| A02: Cryptographic Failures | **Pass** |
| A03: Injection | **Pass** |
| A04: Insecure Design | **Pass** |
| A05: Security Misconfiguration | **Pass** |
| A06: Vulnerable Components | **Pass** |
| A07: Auth Failures | **Pass** |
| A08: Software/Data Integrity | **Needs Work** — Docker image signing recommended |
| A09: Logging/Monitoring | **Pass** |
| A10: SSRF | **Pass** |

---

## References

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [Stripe Security Best Practices](https://stripe.com/docs/security/best-practices)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

**Reviewer:** Security audit team (automated + manual review)
**Status:** Production — Active monitoring
