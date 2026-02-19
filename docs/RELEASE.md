# Release & Deployment

How environments are structured, how code gets deployed, and how to rotate secrets.

---

## Environments

| Environment | URL | Trigger | Database | Firebase Namespace |
|-------------|-----|---------|----------|--------------------|
| **Local** | `localhost:3000` (client) / `localhost:3001` (server) | `pnpm dev` | Local PostgreSQL or Neon dev branch | `/env/local/` (emulator recommended) |
| **Staging** | `staging.skatehubba.com` | Push to `staging` branch | Staging PostgreSQL (Docker or Neon) | `/env/staging/` |
| **Production** | `skatehubba.com` | Push to `main` (Vercel auto-deploy) | Production PostgreSQL (Neon) | `/env/prod/` |

### Environment isolation

All Firestore and Storage paths are namespaced by environment using `getEnvPath()` and `getStoragePath()` from `@skatehubba/config`. The `EXPO_PUBLIC_APP_ENV` variable (`local`, `staging`, or `prod`) controls which namespace is used.

A staging banner appears in the UI when `EXPO_PUBLIC_APP_ENV=staging`. The `assertEnvWiring()` function runs at startup and throws if the API URL doesn't match the expected environment.

See [ENVIRONMENT_SEPARATION.md](ENVIRONMENT_SEPARATION.md) for the full environment config spec.

---

## How Deployments Work

### Production (web client)

Vercel deploys automatically on push to `main` via GitHub integration.

```
Push to main
  → Vercel builds client (pnpm -C client build)
  → Deploys to CDN edge network
  → Available at skatehubba.com
```

The `deploy.yml` workflow runs `pnpm -C client typecheck` as a guard but does not deploy — Vercel handles that.

### Staging (full stack)

The `deploy-staging.yml` workflow runs on push to the `staging` branch:

```
Push to staging
  → Build Docker image (multi-stage: deps → client build → production)
  → Push to GitHub Container Registry (ghcr.io)
  → Trivy CVE scan on the image (blocks on CRITICAL/HIGH)
  → SSH into staging server
  → docker compose pull && up -d --no-deps app
  → Run Drizzle database migrations
  → Smoke test: health check + API docs check
```

The staging server runs Docker Compose with:
- **app** — Express server + built client (port 3001)
- **db** — PostgreSQL 16 Alpine
- **redis** — Redis 7 Alpine
- **nginx** — TLS termination (ports 80/443)
- **certbot** — Let's Encrypt auto-renewal

See `docker-compose.staging.yml` for the full service definition.

### Cloud Functions

Firebase Cloud Functions are deployed separately:

```bash
firebase deploy --only functions
```

Functions handle RBAC role management and are not part of the staging Docker stack.

### Mobile

Mobile builds use Expo EAS:

```bash
# Development build
eas build --platform ios --profile development

# Preview (internal testing)
eas build --platform all --profile preview

# Production submission
eas build --platform all --profile production
eas submit --platform all
```

See `mobile/store-assets/SUBMISSION_CHECKLIST.md` for app store requirements.

---

## CI Pipeline

Every push and PR runs the `ci.yml` workflow:

```
1. Lockfile integrity (pnpm install --frozen-lockfile)
2. Formatting check (pnpm format:check)
3. Lint (pnpm lint) — zero warnings enforced
4. TypeScript typecheck (pnpm -r run typecheck)
5. Build (pnpm build)
6. Unit tests (pnpm test) with coverage
7. Dependency audit (pnpm audit:deps:ci)
8. Secret scanning (pnpm scan:secrets)
```

Additional workflows:
- `codeql.yml` — Static analysis for security vulnerabilities
- `security.yml` — Security-focused checks
- `verify-firebase-rules.yml` — Firestore/Storage rules validation
- `smoke-test.yml` — Post-deploy verification
- `mobile-e2e.yml` — Detox E2E tests on iOS/Android

### Pre-merge checklist

Run locally before pushing:

```bash
pnpm verify    # typecheck + lint + test + build
```

---

## Database Migrations

Migrations use Drizzle Kit and are stored in `migrations/`.

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Push schema directly (development only — skips migration files)
pnpm db:push

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

In CI, `pnpm db:migrate` runs automatically after staging deploy.

See `migrations/README.md` and `migrations/QUICKSTART.md` for details.

---

## Secret Rotation

### Inventory

| Secret | Location | Rotation Impact |
|--------|----------|-----------------|
| `JWT_SECRET` | Server env | Invalidates all active sessions. Users must re-login. |
| `SESSION_SECRET` | Server env | Invalidates Express sessions. |
| `MFA_ENCRYPTION_KEY` | Server env | Invalidates all enrolled TOTP secrets. Users must re-enroll MFA. |
| `FIREBASE_ADMIN_KEY` | Server env (JSON) | Server loses Firebase Admin access until updated. |
| `STRIPE_SECRET_KEY` | Server env | Payment processing stops until updated. |
| `STRIPE_WEBHOOK_SECRET` | Server env | Webhook signature verification fails. Stripe retries for up to 72h. |
| `RESEND_API_KEY` | Server env | Email delivery stops until updated. |
| `OPENAI_API_KEY` | Server env | AI Skate Buddy (Hesher) stops responding. |
| `GOOGLE_AI_API_KEY` | Server env | Google AI features stop. |
| `ADMIN_API_KEY` | Server env | Admin API access blocked until updated. |
| `DATABASE_URL` | Server env | App cannot connect to database. |
| `STAGING_SSH_KEY` | GitHub Secrets | Staging deploys fail until updated. |

### Rotation procedure

1. **Generate the new secret** — use `openssl rand -hex 32` for symmetric keys, or the provider's dashboard for API keys.

2. **Update the environment variable** — for staging, update `.env.staging` on the server and GitHub repository variables/secrets. For production, update in the hosting platform (Vercel environment variables).

3. **Restart the server** — for staging: `docker compose -f docker-compose.staging.yml restart app`. The new value takes effect on process start.

4. **Verify** — check health endpoint (`/api/health`) and test the affected feature.

### Key-specific notes

**JWT_SECRET / SESSION_SECRET:**
These keys sign tokens. Rotation immediately invalidates all existing sessions. Plan for off-peak rotation.

**MFA_ENCRYPTION_KEY:**
This encrypts TOTP secrets at rest. Changing it makes all enrolled MFA unrecoverable. Before rotating:
1. Notify affected users
2. Decrypt all TOTP secrets with the old key
3. Re-encrypt with the new key
4. Or: disable MFA for all users and require re-enrollment

**FIREBASE_ADMIN_KEY:**
This is a JSON service account key. Rotate via Firebase Console > Project Settings > Service Accounts > Generate New Private Key. Delete the old key after confirming the new one works.

**STRIPE_SECRET_KEY:**
Rotate via Stripe Dashboard > Developers > API Keys > Roll Key. Stripe provides a grace period where both old and new keys work.

**DATABASE_URL:**
Coordinate with your database provider (Neon). Update the password in both the provider dashboard and the environment variable simultaneously.

### Secret scanning

Secrets are scanned in multiple layers:
- **Pre-commit:** Gitleaks via Husky git hooks
- **CI:** `pnpm scan:secrets` (Secretlint) runs on every push
- **GitHub:** Push protection enabled (`.github/workflows/security.yml`)
- **Container:** Trivy scans Docker images for embedded secrets

---

## Rollback

### Staging

```bash
# SSH into staging server
ssh user@staging-host

# Roll back to previous image
cd /opt/skatehubba
docker compose -f docker-compose.staging.yml pull app  # pulls :latest
# Or specify a specific SHA:
# docker compose ... run --rm app image:specific-sha
docker compose -f docker-compose.staging.yml up -d --no-deps app
```

### Production (Vercel)

Use the Vercel dashboard to promote a previous deployment to production, or revert the git commit on `main`.

### Database

Drizzle migrations are forward-only. If a migration needs reverting, write a new migration that undoes the changes. Neon provides point-in-time recovery for disaster scenarios.

---

## Related Docs

- [ENVIRONMENT_SEPARATION.md](ENVIRONMENT_SEPARATION.md) — Detailed environment config and Firebase namespace isolation
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — Incident response and deployment troubleshooting
- [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) — What runs where and trust boundaries
- [PRODUCTION_READINESS_REVIEW.md](PRODUCTION_READINESS_REVIEW.md) — Pre-launch hardening checklist
