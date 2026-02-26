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
  → Vercel runs: node scripts/verify-public-env.mjs && pnpm --filter skatehubba-client build
  → Output: client/dist
  → Deploys to CDN edge network
  → Available at skatehubba.com
```

The `deploy.yml` workflow runs `pnpm -C client typecheck` as a guard but does not deploy — Vercel handles that via its GitHub integration. See `vercel.json` for the authoritative build config.

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

Every push to `main` and every PR runs the `ci.yml` workflow:

**Lockfile Integrity** (`lockfile_check`)
- `pnpm install --frozen-lockfile --ignore-scripts`

**Quality Control** (`build_lint_typecheck`) — depends on lockfile check
1. Formatting check (`pnpm format:check` — Prettier on JSON files)
2. Package validation (`pnpm run validate:packages` + `pnpm run validate:package-manager`)
3. TypeScript typecheck (`pnpm run typecheck`)
4. Lint (`pnpm run lint` — ESLint, zero warnings enforced)
5. Build (with placeholder Firebase env vars)
6. Unit tests with coverage (`pnpm vitest run --coverage` — 98/93/99/99 thresholds)

**Bundle Size Budget** (`bundle_size`) — runs in parallel
- Builds client, then runs `node scripts/check-bundle-size.mjs --ci`
- Budgets: totalJs 1825 KB, totalCss 300 KB

**Migration Drift Check** (`migration_drift`) — runs in parallel
- Runs `pnpm db:generate` and checks for uncommitted migration changes

**Mobile Quality Control** (`mobile_quality`) — runs in parallel
- TypeScript typecheck and ESLint for the mobile app

**Security Guardrail** (`rules_scan`)
- Blocks insecure Firestore/Storage rules (wildcard `allow read, write: if true`)

**Firebase Rules Validation** (`firebase_rules_verify`)
- Validates Firestore/Storage rules via Firebase CLI (requires `FIREBASE_TOKEN`)

**Mobile Detox Smoke** (`mobile_detox_smoke`)
- Runs Android E2E smoke tests via `mobile-e2e.yml`

**Secret Scanning** (`secret_scan`)
- Blocks merge conflict markers
- Gitleaks scan across all branches and PRs

Additional workflows:
- `codeql.yml` — Static analysis for security vulnerabilities
- `security.yml` — Security-focused checks
- `verify-firebase-rules.yml` — Firestore/Storage rules validation (standalone)
- `smoke-test.yml` — Post-deploy health checks
- `mobile-e2e.yml` — Detox E2E tests on iOS/Android
- `mobile-preview.yml` — EAS preview builds on PR

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

Images are tagged with both the git SHA and `latest` in `ghcr.io`. To roll back:

```bash
# SSH into staging server
ssh user@staging-host
cd /opt/skatehubba

# Option 1: Roll back to a specific commit SHA
export IMAGE=ghcr.io/myhuemungusD/skatehubba/staging:<commit-sha>
docker pull $IMAGE
docker tag $IMAGE ghcr.io/myhuemungusD/skatehubba/staging:latest
docker compose -f docker-compose.staging.yml up -d --no-deps app

# Option 2: Redeploy by pushing the previous commit to the staging branch
git push origin <previous-commit>:staging
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
