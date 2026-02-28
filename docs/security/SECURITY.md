# Security Policy & Hardening Log

## Post-MVP Hardening Status (2026-01-09, updated 2026-02-26)

This document tracks security decisions, accepted risks, and verification steps for the SkateHubba™ platform. Originally created as the audit trail for PR #54, now maintained as the living security decisions log.

### 1. Risk Acceptance Log

We explicitly accept the following residual risks to prioritize performance and UX over theoretical security perfection.

- **Ephemeral Rate Limiting (Distributed DoS)**
  - **Risk:** In-memory rate limiting (`express-rate-limit`) is isolated per Firebase Function instance. Rapid auto-scaling could theoretically dilute limits.
  - **Decision:** ACCEPTED.
  - **Rationale:** We are optimizing for abuse prevention (script kiddies), not state-actor DDoS defense. True DDoS mitigation is delegated to Google Cloud Armor.

- **IP Trust & Proxy Configuration**
  - **Risk:** Reliance on standard Express `trust proxy` settings without complex IP reputation checks.
  - **Decision:** ACCEPTED.
  - **Rationale:** We assume standard GCP `X-Forwarded-For` reliability. Complexity of custom IP validation outweighs the benefit at this stage.

- **No CAPTCHA on Write**
  - **Risk:** Public endpoints (Add Spot) are protected by Auth tokens and Rate Limits, but not CAPTCHA.
  - **Decision:** ACCEPTED.
  - **Rationale:** User experience priority. Captchas kill conversion. Auth barrier is sufficient for current threat model.

### 2. Deployment Verification Tasks

_Performed upon deployment of PR #54 to Staging. All verified._

- [x] **Rate Limit Headers:** `RateLimit-Limit` and `RateLimit-Remaining` headers confirmed on API responses.
- [x] **Strict Limit Enforcement:** `/api/spots` returns `429 Too Many Requests` after exceeding limit.
- [x] **Trust Proxy:** `req.ip` resolves to client IP (trust proxy set to 1).
- [x] **CSRF Block:** Mismatched `Origin` header returns `403 Forbidden`.

### 3. Deferred Hardening (Backlog)

_Trigger conditions for revisiting these items:_

- **Distributed Store (Redis):** ~~Trigger if legitimate traffic consistently exceeds single-instance memory limits or we see distributed spam attacks.~~ **IMPLEMENTED** — Redis backing for rate limiting and session store is now in production. In-memory fallback exists for Redis unavailability.
- **WAF / Cloud Armor:** Trigger if we sustain a Layer 7 DDoS attack > 5 minutes. **STATUS:** Not yet triggered. Google Cloud Armor available for activation.
- **Strict CSP (Content Security Policy):** `unsafe-inline` removed from `scriptSrc` (Feb 6 fix). `unsafe-inline` remains in `styleSrc` — deferred until CSS-in-JS migration or nonce-based approach is feasible.

### 4. Subsequent Audit History

| Date       | Audit Type                | Key Outcomes                                                                      |
| ---------- | ------------------------- | --------------------------------------------------------------------------------- |
| 2026-02-06 | Initial Health Check      | Grade B+. 3 critical/high fixed. Established baseline.                            |
| 2026-02-12 | Mobile Security Audit     | 2 critical + 3 high fixed. 4 recommendations open.                                |
| 2026-02-18 | API Third Pass            | Additional route-level fixes.                                                     |
| 2026-02-24 | Full E2E Production Audit | Grade A-. 44 findings identified, all remediated. 5 deferred as design decisions. |
| 2026-02-26 | Verification Pass         | All remediations confirmed current. Security documentation updated.               |

### 5. Open Items & Accepted Risks (as of 2026-02-26)

| Item                              | Severity | Decision | Rationale                                                                             |
| --------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| M10: Admin data over-exposure     | Medium   | DEFERRED | Requires sub-role architecture; admin routes already require full admin auth          |
| M11: Concurrent purchase requests | Medium   | DEFERRED | Idempotency keys + DB transaction prevent double-upgrades; Redis lock is optimization |
| M14: Socket error info leaks      | Medium   | ACCEPTED | Error codes needed for client UX; specifics logged server-side only                   |
| M15: Legacy MFA cipher            | Medium   | DEFERRED | Deprecation deadline: December 2026. Requires coordinated re-enrollment campaign      |
| L12: Challenge self-voting        | Low      | DEFERRED | Requires Cloud Function enforcement; Firestore rules alone insufficient               |
| styleSrc unsafe-inline            | Low      | DEFERRED | Pending CSS-in-JS migration or nonce-based approach                                   |
| Mobile: Certificate pinning       | High     | DEFERRED | App Check attestation in gradual rollout partially mitigates                          |
| Mobile: Android backup            | High     | DEFERRED | Tracked in mobile backlog                                                             |
| Mobile: Jailbreak detection       | Medium   | DEFERRED | Tracked in mobile backlog                                                             |
