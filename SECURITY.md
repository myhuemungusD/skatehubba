# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.

## Post-MVP Hardening

Residual risk acceptance (Post-MVP, acceptable for current stage):

- Distributed DoS mitigation is deferred to infrastructure controls.
- Application-level rate limiting is best-effort abuse prevention, not DDoS defense.
- IP trust assumptions are acceptable pending deployment verification.

## Deployment Verification (Required Check)

Before the next production deploy:

- Confirm `app.set('trust proxy', true)` is present and correct for Firebase / Google Cloud Functions.
- Validate `req.ip` behavior by logging IPs in a staging deploy and confirming consistency behind the Google load balancer.
- If incorrect, adjust `trust proxy` to the documented hop count for GCP and re-run rate limit verification.

## Deferred Task (Post-MVP, Non-Blocking)

Evaluate infrastructure-layer mitigation options (tagged: security, infrastructure, post-mvp):

- Google Cloud Armor
- Edge-level rate limiting / WAF rules
- Firebase Hosting / Cloud Functions integration points

## Hardening Phase Lock

Once CodeQL alerts are resolved and baselined:

- Re-run CodeQL and confirm no HIGH severity alerts.
- Tag the release: `git tag -a v0.2.1-security-baseline -m "Security hardening baseline complete"`
- Push the tag: `git push origin v0.2.1-security-baseline`
