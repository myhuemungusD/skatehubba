# Security Risk Acceptance Log - SkateHubba™
**Phase:** Post-MVP Hardening
**Date:** 2026-01-09
**Approver:** Senior Engineering Team

## 1. Ephemeral Rate Limiting State (Distributed DoS)
* **Risk:** The rate limiting implementation uses in-memory storage (`express-rate-limit`). In a serverless environment (Firebase Functions), state is not shared between instances. An attacker triggering auto-scaling could theoretically bypass limits by hitting fresh instances.
* **Decision:** ACCEPTED
* **Rationale:**
    * The current goal is **Abuse Prevention** (stopping a broken script or a single malicious user), not **DDoS Defense**.
    * True DDoS mitigation is an infrastructure responsibility (Google Cloud Armor / Load Balancer), not an application-layer concern.
    * Implementing a shared store (e.g., Redis) introduces significant cost and maintenance overhead ("over-engineering") that violates the "Baker/Shake Junt era grit" constraint.

## 2. IP Trust & Proxy Configuration
* **Risk:** Rate limiting relies on `req.ip`. If the express `trust proxy` setting does not perfectly align with the Google Cloud Load Balancer headers, an attacker might spoof IPs to bypass limits.
* **Decision:** ACCEPTED
* **Rationale:**
    * We assume standard Google Cloud Platform behavior where the `X-Forwarded-For` header is reliable.
    * The impact of a bypass is limited to API spam, which is further mitigated by the `strictLimiter` on write endpoints.
    * Verification is deferred to the staging deployment check.

## 3. Lack of CAPTCHA on Public Write Endpoints
* **Risk:** While we rate limit write endpoints, we do not challenge users with CAPTCHA (e.g., reCAPTCHA v3) on Spot Creation.
* **Decision:** ACCEPTED
* **Rationale:**
    * **UX Priority:** We prioritize "Cold start < 2.5s" and fluid UX over strict bot prevention. CAPTCHAs degrade the skater experience.
    * **Auth Requirement:** All write endpoints require a valid Firebase Auth ID token (`Authorization: Bearer`), which already acts as a significant barrier to entry for simple bots.
