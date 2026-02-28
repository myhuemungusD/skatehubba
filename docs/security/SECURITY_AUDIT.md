# Security Audit Workflow Documentation

**Last Updated:** 2026-02-26
**Workflow Version:** 2.0.0

## Overview

The Security Audit workflow performs comprehensive security checks on the SkateHubba application. It runs automatically on pull requests and pushes to the main branch, providing continuous security monitoring.

## Workflow Files

| Workflow       | File                                   | Purpose                                        |
| -------------- | -------------------------------------- | ---------------------------------------------- |
| Security Audit | `.github/workflows/security.yml`       | Dependency audit, Gitleaks, license compliance |
| CodeQL         | `.github/workflows/codeql.yml`         | Static analysis (JavaScript/TypeScript)        |
| CI             | `.github/workflows/ci.yml`             | Build, test, lint, Firebase rules validation   |
| Deploy Staging | `.github/workflows/deploy-staging.yml` | Docker build with Trivy vulnerability scanning |

## Triggers

- Pull requests (opened, synchronize, reopened)
- Push to main branch
- Manual workflow dispatch

## Security Checks Performed

### 1. Dependency Audit (pnpm)

- Runs `pnpm audit` to check for known vulnerabilities across all workspaces
- Reports severity levels: Critical, High, Moderate, Low
- Configurable failure thresholds via `scripts/audit-dependencies.mjs`
- CI mode (`audit:deps:ci`) enforces stricter thresholds

**What it checks:**

- Known security vulnerabilities in production and dev dependencies
- CVEs (Common Vulnerabilities and Exposures)
- Package integrity via `--frozen-lockfile`

### 2. Secret Detection (Multi-Layer)

The platform uses multiple complementary scanning tools:

**Gitleaks** (`.gitleaks.toml`):

- Scans on push and PR events
- Allowlists test files, example env files, Firebase config templates
- No blanket exclusions

**Secretlint** (`.secretlintrc.json`):

- Detects database connection strings, API keys
- Allows test credential patterns only

**Custom Scanner** (`scripts/scan-secrets.mjs`):

- Orchestrates Secretlint, hardcoded secret patterns, Gitleaks, detect-secrets, ggshield
- Runs as `pnpm scan:secrets`

**Patterns detected:**

- Firebase API keys: `AIzaSy[0-9A-Za-z_-]{33}`
- Stripe keys: `sk_live_*`, `sk_test_*`, `pk_live_*`, `pk_test_*`
- AWS keys: `AKIA[0-9A-Z]{16}`
- OpenAI keys: `sk-[a-zA-Z0-9]{48}`
- GitHub tokens: `ghp_*`, `github_pat_*`
- GitLab tokens: `glpat-*`
- Google OAuth: `*.apps.googleusercontent.com`
- Database connection strings
- Generic high-entropy strings

### 3. Static Analysis (CodeQL)

- Automated code scanning for JavaScript/TypeScript
- Detects injection vulnerabilities, insecure data handling, auth issues
- Results appear as GitHub Security alerts

### 4. Container Scanning (Trivy)

- Runs on Docker image builds during staging deployment
- Scans for OS package vulnerabilities and application dependencies
- Pinned to `trivy-action@0.28.0` (supply chain hardened)

### 5. License Compliance

- Checks dependency licenses for compatibility
- Part of the security workflow

### 6. Firebase Rules Validation

- Validates Firestore and Storage rules syntax
- Runs on PR and main branch pushes (added Feb 2026)
- Uses `scripts/verify-firebase-rules.mjs`

### 7. OWASP Top 10 Compliance

Platform compliance verified across all categories:

| Category                       | Status     | Implementation                                                   |
| ------------------------------ | ---------- | ---------------------------------------------------------------- |
| A01: Broken Access Control     | **Pass**   | Auth middleware on all routes, role checks, ownership validation |
| A02: Cryptographic Failures    | **Pass**   | AES-256-GCM, bcrypt (12 rounds), SHA-256 session hashing         |
| A03: Injection                 | **Pass**   | Drizzle ORM, Zod validation, strict socket schemas               |
| A04: Insecure Design           | **Pass**   | Defense-in-depth, rate limiting, re-authentication               |
| A05: Security Misconfiguration | **Pass**   | Helmet, strict CSP, env validation at boot                       |
| A06: Vulnerable Components     | **Pass**   | Node 22, pinned actions, Dependabot, audit scripts               |
| A07: Auth Failures             | **Pass**   | MFA, lockout, re-auth, session invalidation                      |
| A08: Software/Data Integrity   | Needs Work | Docker image signing recommended                                 |
| A09: Logging/Monitoring        | **Pass**   | Comprehensive audit logging, Sentry                              |
| A10: SSRF                      | **Pass**   | No user-controlled HTTP requests                                 |

## Report Distribution

1. **PR Comments**: Security findings posted as comments on pull requests
2. **GitHub Security Tab**: CodeQL alerts appear in repository security dashboard
3. **Workflow Artifacts**: Full reports available for download from workflow runs
4. **Audit Documents**: Comprehensive reports maintained in `SECURITY_AUDIT.md` and `SECURITY_AUDIT_MOBILE.md`

## Current Security Status (2026-02-26)

### Strengths

- Helmet security headers with strict CSP (no `unsafe-inline` for scripts)
- 15+ rate limiting configurations across all layers
- Input validation with Zod on all write endpoints
- Drizzle ORM prevents SQL injection
- Comprehensive audit logging with Pino + dual storage
- Sentry error monitoring in production
- Firebase Auth + custom session management with MFA
- pnpm lockfile integrity enforced in CI
- Multi-tool secret scanning (Gitleaks + Secretlint + CodeQL + Trivy)
- Default-deny Firestore/Storage rules with field whitelisting
- Non-root Docker container (user `skatehubba:1001`)
- Node.js 22 LTS (EOL: April 2027)

### Open Items

- `unsafe-inline` in `styleSrc` — deferred (low risk, pending CSS approach)
- Docker image signing — recommended for OWASP A08
- Mobile certificate pinning — in backlog (App Check partially mitigates)

## Usage

### Viewing Reports

**On Pull Requests:**
Security findings are automatically commented on PRs. CodeQL alerts appear in the Security tab.

**In Workflow Runs:**

1. Go to Actions tab in GitHub
2. Click on the relevant workflow (Security, CodeQL, CI)
3. Review logs or download artifacts

### Manual Trigger

1. Go to Actions tab
2. Select "Security" or "CodeQL" workflow
3. Click "Run workflow"
4. Select branch and run

### Running Locally

```bash
# Dependency audit
pnpm audit:deps

# Secret scanning
pnpm scan:secrets

# Firebase rules validation
pnpm verify:firebase-rules

# Environment validation
pnpm validate:env
```

## Integration with CI/CD

The security workflows run in parallel with build/test jobs. Findings are reported but do not block merges by default — this allows development velocity while maintaining security visibility.

**Deployment pipeline security:**

1. PR opened → Security audit + CodeQL + CI (Firebase rules validation)
2. Merge to main → Same checks + staging deployment trigger
3. Deploy staging → Docker build with Trivy scanning, SSH deployment

## Maintenance

### Updating Secret Patterns

- **Gitleaks:** Edit `.gitleaks.toml`
- **Secretlint:** Edit `.secretlintrc.json`
- **Custom scanner:** Edit `scripts/scan-hardcoded-secrets.mjs`

### Updating Dependency Audit Thresholds

Edit `scripts/audit-dependencies.mjs` to adjust failure severity levels.

### Pinning GitHub Actions

When updating actions, always pin to specific SHAs or exact versions:

```yaml
# Good
- uses: aquasecurity/trivy-action@0.28.0
# Bad
- uses: aquasecurity/trivy-action@master
```

## Audit Schedule

| Cadence    | Type                      | Next Date     |
| ---------- | ------------------------- | ------------- |
| Continuous | Automated CI/CD scans     | Every PR/push |
| Weekly     | Dependabot updates        | Ongoing       |
| Quarterly  | Full E2E production audit | May 2026      |
| As needed  | Mobile-specific audit     | TBD           |

## Related Documentation

- [SECURITY.md](../../SECURITY.md) — Public security policy
- [SECURITY_AUDIT.md](../../SECURITY_AUDIT.md) — Full E2E production audit report
- [SECURITY_AUDIT_MOBILE.md](../../SECURITY_AUDIT_MOBILE.md) — Mobile security audit
- [SECURITY_HEALTH_CHECK.md](../../SECURITY_HEALTH_CHECK.md) — Initial health check
- [docs/security/SECURITY.md](SECURITY.md) — Hardening log and risk decisions
- [docs/security/SECURITY_NOTES.md](SECURITY_NOTES.md) — Security controls inventory

## Support

For questions or issues with the security audit workflow, open an issue or email security@skatehubba.com.
