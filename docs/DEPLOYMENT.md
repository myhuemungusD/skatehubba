# Deployment Configuration

This repository uses Vercel GitHub integration for production and GitHub Actions with Docker for staging. Firebase Cloud Functions are deployed separately.

## Workflow Overview

### Production (`deploy.yml`)

The production deploy workflow runs on push to `main` and PRs:

1. **Typecheck Guard**: Runs `pnpm -C client typecheck` to verify no type errors
2. **Vercel Auto-Deploy**: Vercel deploys automatically via its GitHub integration (not triggered by this workflow)

Vercel handles the full build and deploy using the config in `vercel.json`.

### Staging (`deploy-staging.yml`)

The staging deploy workflow runs on push to `staging` or manual dispatch:

1. **Build & Push Docker Image**: Multi-stage Docker build, pushed to `ghcr.io` with SHA and `latest` tags
2. **Container Image Scan**: Trivy CVE scan (blocks on CRITICAL/HIGH severity), uploads SARIF to GitHub Security
3. **Deploy to Staging Server**: SSH into staging host, `docker compose pull && up -d --no-deps app`
4. **Run Database Migrations**: `pnpm db:migrate` with staging DATABASE_URL
5. **Smoke Test**: Health check (5 retries) + API docs verification

## Required Secrets

To enable full deployment functionality, configure the following GitHub repository secrets:

### Firebase

- `FIREBASE_TOKEN`: Firebase CI token for rules validation
  - Generate: Run `firebase login:ci` locally and copy the token
- `FIREBASE_PROJECT_ID`: Your Firebase project ID

### Vercel

Vercel deploys via GitHub integration — no tokens needed in GitHub Actions. Configure environment variables directly in the Vercel dashboard.

### Staging

- `STAGING_HOST`: Staging server hostname/IP
- `STAGING_USER`: SSH username
- `STAGING_SSH_KEY`: SSH private key for deployment
- `STAGING_DATABASE_URL`: PostgreSQL connection string

### Staging Variables (GitHub repository variables)

- `STAGING_API_URL`: Base URL for the staging API
- `STAGING_CANONICAL_ORIGIN`: Canonical origin for the staging environment
- `STAGING_FIREBASE_API_KEY`, `STAGING_FIREBASE_AUTH_DOMAIN`, `STAGING_FIREBASE_PROJECT_ID`, `STAGING_FIREBASE_STORAGE_BUCKET`, `STAGING_FIREBASE_MESSAGING_SENDER_ID`, `STAGING_FIREBASE_APP_ID`
- `STAGING_STRIPE_PK`: Stripe publishable key for staging
- `STAGING_SENTRY_DSN`: Sentry DSN for staging error tracking

## Required Public Env Vars (Web)

Vercel builds must set the following **EXPO_PUBLIC\_\*** variables:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

The build will fail if any are missing. Legacy `VITE_*` equivalents are still accepted as
a fallback but `EXPO_PUBLIC_*` takes priority. If both prefixes are set for the same key,
remove the `VITE_*` version to avoid confusion.

The `scripts/verify-public-env.mjs` script validates these before every build. It checks
`EXPO_PUBLIC_` first, then falls back to `VITE_` prefix. In strict mode (Vercel/production),
missing vars cause the build to fail.

## Configuration Files

### Vercel (`vercel.json`)

The authoritative deployment config:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "node scripts/verify-public-env.mjs && pnpm --filter skatehubba-client build",
  "outputDirectory": "client/dist",
  "framework": "vite",
  "functions": {
    "api/index.ts": { "maxDuration": 30 },
    "api/env-check.ts": { "maxDuration": 5 }
  },
  "rewrites": [
    { "source": "/api/env-check", "destination": "/api/env-check" },
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

### Firebase (`firebase.json`)

Configures:

- Firestore rules and indexes
- Cloud Functions deployment
- Hosting configuration (optional)

### Docker (`Dockerfile`)

Multi-stage build for staging:

- `base` — Node 22 slim with pnpm 10.28.1
- `deps` — Install all workspace dependencies with `--frozen-lockfile`
- `client-build` — Build client with `EXPO_PUBLIC_*` build args via `pnpm -C client build`
- `production` — Non-root user (`skatehubba:1001`), health check on `/api/health/live`, exposes port 3001

Runtime command: `node --import tsx server/index.ts`

## Firebase Cloud Functions

Cloud Functions are located in the `functions/` directory:

```
functions/
├── src/
│   ├── index.ts          # Entry point (re-exports all functions)
│   ├── admin/            # Role management (manageUserRole, getUserRoles)
│   ├── game/             # S.K.A.T.E. battle logic
│   ├── video/            # Storage triggers
│   ├── commerce/         # Stripe/payment functions
│   └── shared/           # Shared utilities (rate limiting, etc.)
├── package.json
├── tsconfig.json
└── .gitignore
```

### Deployed Functions

- **Admin**: `manageUserRole`, `getUserRoles` — RBAC role management with custom claims
- **Game**: `submitTrick`, `judgeTrick`, `setterBail`, `getVideoUrl`, `processVoteTimeouts`
- **Video**: `validateChallengeVideo` — Storage trigger for video validation
- **Commerce**: `holdAndCreatePaymentIntent`, `stripeWebhook`, `expireHolds`

Security features: App Check enforcement, Firestore-backed rate limiting, RBAC with custom claims, audit logging.

## Local Development

### Build the application

```bash
pnpm run build
```

### Deploy Firebase Functions manually

```bash
firebase deploy --only functions
```

### Deploy to Vercel manually

```bash
npx vercel --prod
```

## Workflow Triggers

| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy.yml` | Push to `main`, PRs | Typecheck guard (Vercel auto-deploys from `main`) |
| `deploy-staging.yml` | Push to `staging`, manual dispatch | Full Docker build + deploy to staging server |

## Troubleshooting

### Firebase deployment fails

1. Check that `FIREBASE_TOKEN` is set correctly
2. Verify Firebase project is initialized: `firebase use --add`
3. Review Firebase Functions logs: `firebase functions:log`

### Vercel deployment fails

1. Check that all `EXPO_PUBLIC_*` env vars are set in Vercel dashboard
2. Verify Vercel project is linked: `vercel link`
3. Check Vercel deployment logs in the Vercel dashboard

### Build errors

1. Review the build logs artifact in GitHub Actions
2. Run `pnpm run build` locally to reproduce
3. Check for TypeScript errors: `pnpm run typecheck`

### Staging deployment fails

1. Verify `STAGING_SSH_KEY` and `STAGING_HOST` secrets are correct
2. SSH into the staging server and check Docker logs: `docker compose -f docker-compose.staging.yml logs app`
3. Check health endpoint: `curl https://staging.skatehubba.com/api/health`

## GitHub Actions Permissions

The staging workflow requires:

- `contents: read` — To checkout code
- `packages: write` — To push Docker images to ghcr.io
- `security-events: write` — To upload Trivy SARIF results
