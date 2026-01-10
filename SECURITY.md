# Security Policy & Hardening Log

## Post-MVP Hardening Status (2026-01-09)

This document tracks security decisions, accepted risks, and verification steps for the SkateHubba™ platform. It serves as the audit trail for PR #54.

### 1. Risk Acceptance Log
We explicitly accept the following residual risks to prioritize performance and UX over theoretical security perfection.

* **Ephemeral Rate Limiting (Distributed DoS)**
    * **Risk:** In-memory rate limiting (`express-rate-limit`) is isolated per Firebase Function instance. Rapid auto-scaling could theoretically dilute limits.
    * **Decision:** ACCEPTED.
    * **Rationale:** We are optimizing for abuse prevention (script kiddies), not state-actor DDoS defense. True DDoS mitigation is delegated to Google Cloud Armor.

* **IP Trust & Proxy Configuration**
    * **Risk:** Reliance on standard Express `trust proxy` settings without complex IP reputation checks.
    * **Decision:** ACCEPTED.
    * **Rationale:** We assume standard GCP `X-Forwarded-For` reliability. Complexity of custom IP validation outweighs the benefit at this stage.

* **No CAPTCHA on Write**
    * **Risk:** Public endpoints (Add Spot) are protected by Auth tokens and Rate Limits, but not CAPTCHA.
    * **Decision:** ACCEPTED.
    * **Rationale:** User experience priority. Captchas kill conversion. Auth barrier is sufficient for current threat model.

### 2. Deployment Verification Tasks
*To be performed immediately upon deployment of PR #54 to Staging:*

- [ ] **Rate Limit Headers:** Verify `RateLimit-Limit` and `RateLimit-Remaining` headers appear on standard API responses.
- [ ] **Strict Limit Enforcement:** Hammer the `/api/spots` endpoint >10 times and verify `429 Too Many Requests`.
- [ ] **Trust Proxy:** Inspect logs to verify `req.ip` correctly resolves to the client IP, not the Google Load Balancer IP.
- [ ] **CSRF Block:** Attempt a `POST` request with a mismatched `Origin` header (e.g., via Postman spoofing) and verify `403 Forbidden`.

### 3. Deferred Hardening (Backlog)
*Trigger conditions for revisiting these items:*

* **Distributed Store (Redis):** Trigger if legitimate traffic consistently exceeds single-instance memory limits or we see distributed spam attacks.
* **WAF / Cloud Armor:** Trigger if we sustain a Layer 7 DDoS attack > 5 minutes.
* **Strict CSP (Content Security Policy):** Deferred until Web client is fully stabilized to avoid breaking legitimate script loading during rapid feature dev.