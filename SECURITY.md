# Security Policy

**Last Updated:** 2026-02-26

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| staging | :white_check_mark: |

## Security Posture

SkateHubba maintains an **A-** security grade as assessed by our most recent comprehensive audit (2026-02-24). The platform runs on Node.js 22 LTS with defense-in-depth architecture including:

- **Authentication:** Firebase Auth + bcrypt (12 rounds) + MFA (AES-256-GCM)
- **Authorization:** Role-based access control with re-authentication for sensitive operations
- **Input validation:** Zod schemas on all write endpoints
- **Database:** Drizzle ORM with parameterized queries (no raw SQL)
- **CSRF:** OWASP Double Submit Cookie with timing-safe comparison
- **Rate limiting:** 15+ configurations across auth, API, WebSocket, and admin routes
- **Secret scanning:** Gitleaks + CodeQL + Secretlint + Trivy in CI/CD
- **Firestore/Storage rules:** Default-deny with field whitelisting and environment isolation

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email security concerns to: **security@skatehubba.com**

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected component (server, client, mobile, Firebase rules, infrastructure)
- Any suggested fixes (optional)

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 1 week
- **Resolution Target:** Within 30 days for critical issues, 90 days for medium/low

## Severity Classification

| Severity | Examples                                       | Target Resolution |
| -------- | ---------------------------------------------- | ----------------- |
| Critical | Auth bypass, RCE, payment manipulation         | 48 hours          |
| High     | Privilege escalation, data exposure, injection | 7 days            |
| Medium   | Information disclosure, missing controls       | 30 days           |
| Low      | Best practice deviations, hardening            | 90 days           |

## Bug Bounty

We do not currently offer a paid bug bounty program, but we appreciate responsible disclosure and will credit reporters in our changelog (with permission).

## Audit History

| Date       | Type                      | Grade | Findings                     |
| ---------- | ------------------------- | ----- | ---------------------------- |
| 2026-02-24 | Full E2E Production Audit | A-    | 44 findings (all remediated) |
| 2026-02-12 | Mobile Security Audit     | —     | 2 critical, 3 high, 4 medium |
| 2026-02-06 | Security Health Check     | B+    | 3 critical/high fixed        |

## Detailed Security Documentation

For technical security details, threat models, and hardening logs, see [docs/security/](docs/security/).
