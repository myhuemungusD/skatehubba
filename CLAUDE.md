# CLAUDE.md — SkateHubba™ Codebase Context

> Claude Code reads this file automatically. Do not scan the full codebase unless a task specifically requires it.

## Product

SkateHubba™ is "Strava for skateboarding" — a location-based social network where skaters find spots, film clips, and compete remotely via async S.K.A.T.E. games. Owned by Design Mainline LLC (USPTO SN 99356919).

**MVP focus**: Auth + Spot Map + Async S.K.A.T.E. game. Ship 1 feature at 100% over 10 at 10%. Unbuilt features render as "Coming Soon" placeholders.

## Monorepo Layout

```
skatehubba/
├── client/           # React 18 + Vite 6 + TypeScript + Tailwind (SPA)
├── server/           # Express API + PostgreSQL backend
│   ├── auth/         # Firebase Auth routes (login, mfa, email verify, password)
│   ├── routes/       # API route modules (spots, games, profile, admin, etc.)
│   ├── services/     # Business logic (game/, storageService, userService, etc.)
│   ├── middleware/    # Auth, rate limiting, CORS, bandwidth, cron auth
│   ├── socket/       # Socket.io real-time (game state, presence, typing)
│   └── api-docs/     # OpenAPI endpoint definitions
├── mobile/           # React Native / Expo
├── packages/
│   ├── shared/       # Shared business logic + Drizzle schema (@shared/*)
│   ├── types/        # Shared TypeScript types
│   ├── db/           # Drizzle schema & queries
│   ├── config/       # Shared configuration
│   ├── firebase/     # Firebase client helpers
│   └── utils/        # Shared utilities
├── migrations/       # PostgreSQL migration scripts (Drizzle)
├── scripts/          # Build, validation, deploy (build-server.mjs, verify-public-env.mjs, etc.)
├── e2e/              # Playwright E2E tests
├── deploy/           # Docker / Nginx / SSL (staging)
└── docs/             # Architecture, security, setup guides
```

## Tech Stack (locked — no substitutions without approval)

| Layer    | Technology                                                         |
| -------- | ------------------------------------------------------------------ |
| Frontend | React 18, Vite 6, TypeScript 5.9, Tailwind CSS, shadcn/ui, Zustand |
| Maps     | Leaflet + React Leaflet + OSM                                      |
| Backend  | Express, TypeScript, esbuild bundler                               |
| Database | PostgreSQL 16 (Neon) + Drizzle ORM + Redis 7                       |
| Auth     | Firebase Auth + custom JWT                                         |
| Realtime | Socket.io                                                          |
| Mobile   | React Native, Expo (EAS builds)                                    |
| Testing  | Vitest (unit), Playwright (e2e), Cypress (client e2e)              |
| CI/CD    | GitHub Actions, CodeQL, Vercel (prod), Docker (staging)            |
| Monorepo | pnpm 10+ workspaces, Turborepo                                     |

**Prohibited**: Redux, untyped JS,

## Key Commands

```bash
pnpm install                  # Install deps (pnpm enforced — npm/yarn blocked)
pnpm dev                      # Start client (3000) + server (3001) via Turborepo
pnpm run verify               # Full pre-merge: typecheck + lint + test + build
pnpm test                     # Run all unit tests (Vitest)
pnpm test:coverage            # Coverage report (thresholds: 95/85/95/95)
pnpm run typecheck            # TypeScript strict check across all packages
pnpm run lint                 # ESLint across all packages
pnpm run build                # Production build (verifies public env first)
pnpm db:generate              # Generate Drizzle migrations
pnpm db:migrate               # Run migrations
pnpm db:push                  # Push schema to DB
pnpm db:studio                # Drizzle Studio GUI
```

## API Route Map

All routes registered in `server/routes.ts`:

| Prefix               | Router                  | Auth         | Notes                              |
| -------------------- | ----------------------- | ------------ | ---------------------------------- |
| `/api/auth/*`        | auth/routes.ts          | Public       | Login, MFA, email verify, password |
| `/api/spots`         | routes/spots.ts         | Mixed        | CRUD for skate spots               |
| `/api/games`         | routes/games.ts         | Required     | S.K.A.T.E. game CRUD               |
| `/api/profile`       | routes/profile.ts       | Rate-limited | User profile management            |
| `/api/users`         | routes/users.ts         | Mixed        | User lookup/management             |
| `/api/trickmint`     | routes/trickmint.ts     | Paid/Pro     | Video uploads                      |
| `/api/remote-skate`  | routes/remoteSkate.ts   | Rate-limited | Remote S.K.A.T.E. (async 1v1)      |
| `/api/matchmaking`   | routes/matchmaking.ts   | Mixed        | Game matchmaking                   |
| `/api/notifications` | routes/notifications.ts | Mixed        | Push notifications                 |
| `/api/stats`         | routes/stats.ts         | Public       | Landing page stats                 |
| `/api/beta-signup`   | routes/betaSignup.ts    | Rate-limited | Email signup                       |
| `/api/admin`         | routes/admin.ts         | Admin        | Admin dashboard                    |
| `/api/metrics`       | routes/metrics.ts       | Admin        | Platform metrics                   |
| `/api/moderation`    | routes/moderation.ts    | Required     | Reports + trust/safety             |
| `/api/analytics`     | routes/analytics.ts     | Public       | Event tracking                     |
| `/api/cron`          | routes/cron.ts          | Cron secret  | Scheduled tasks                    |
| `/api/tier`          | routes/tier.ts          | Mixed        | Subscription tiers                 |
| `/webhooks/stripe`   | routes/stripeWebhook.ts | Webhook      | Stripe payment hooks               |

## Client Route Map

Defined in `client/src/` router:

- **Public**: `/auth`, `/landing`, `/forgot-password`, `/privacy`, `/terms`, `/demo`, `/skater/:handle`
- **Protected (dashboard)**: `/hub`, `/play`, `/me`, `/map`, `/leaderboard`, `/spots/:id`, `/profile/setup`, `/trickmint`
- **Admin**: `/admin`, `/admin/reports`, `/admin/users`, `/admin/metrics`
- **Legacy redirects**: `/home` → `/hub`, `/game` → `/play`, `/closet` → `/me`

## Database

PostgreSQL via Drizzle ORM. Schema lives in `packages/shared/schema/`. Key tables:

- `customUsers` — user profiles (Firebase UID reference, username, stance, XP)
- `usernames` — username reservation (uniqueness enforcement)
- `spots` — skate spots (lat/lng, name, type, tier, creator, status)
- `games` / `gameSessions` — S.K.A.T.E. game state
- `gameTurns` — individual turns with video references
- `gameDisputes` — dispute resolution
- `check_ins` — geo-verified check-ins (user → spot)

Path aliases: `@shared/*` → `packages/shared/*` (resolved by esbuild at build time for Vercel serverless).

## Auth Flow

Firebase Auth (identity only) → Express middleware (`server/auth/middleware.ts`) verifies Firebase ID token → creates/retrieves user in PostgreSQL. Auth routes split across:

- `server/auth/routes/login.ts` — POST `/api/auth/login`, GET `/api/auth/me`, POST `/api/auth/logout`
- `server/auth/routes/emailVerification.ts` — email verify flow
- `server/auth/routes/password.ts` — change, forgot, reset
- `server/auth/routes/mfa.ts` — multi-factor auth
- `server/auth/routes/reauth.ts` — re-authentication for sensitive ops

## S.K.A.T.E. Game Architecture

Async 1v1 turn-based. Core logic in `server/services/game/`:

- `createJoin.ts` — game creation + joining with row-level locking
- `tricks.ts` — trick submission + passing
- `queries.ts` — game state reads
- `forfeit.ts` — forfeit handling
- `timeouts.ts` — 24-hour deadline enforcement
- `connection.ts` — disconnect/reconnect
- `helpers.ts` / `types.ts` / `constants.ts` — shared utilities

Game routes refactored into modular files under `server/routes/`:

- `games-challenges.ts` — create, respond
- `games-turns.ts` — submit turn, judge
- `games-disputes.ts` — dispute, resolve
- `games-management.ts` — forfeit, my-games, get by ID
- `games-cron.ts` — forfeit expired, deadline warnings

Key design: one-take video, auto-send, no retries. 24-hour turn deadline. First to spell S.K.A.T.E. loses.

## Build & Deploy

- **Production**: Vercel auto-deploys `main` branch. Build: `node scripts/verify-public-env.mjs && pnpm --filter skatehubba-client build`. Output: `client/dist`.
- **Server build**: `node scripts/build-server.mjs` (esbuild, resolves `@shared/*` aliases)
- **Staging**: Docker Compose via GitHub Actions on `staging` branch
- **Vercel project**: `prj_oMt9J3VbOW8k4r6VqoBELqZ59dR5`, team `skatehubba`

## Coding Standards

- `any` is forbidden — validate all external data at boundaries
- Guard clauses + early returns only, no deep nesting
- Mobile-first, touch targets ≥ 44px, no hover-only interactions
- Fail visibly — blank screens are release blockers
- All commits: conventional commits, all-lowercase subject (commitlint enforced)
- Coverage thresholds: statements 95%, branches 85%, functions 95%, lines 95%

## Environment

- Node.js ≥ 22 (see `.nvmrc`)
- pnpm ≥ 10 (enforced via preinstall hook)
- `.env` from `.env.example` — Firebase credentials, DATABASE_URL, CRON_SECRET, Stripe keys, etc.

## Common Gotchas

1. **`@shared/*` path aliases** break in Vercel serverless — esbuild pre-resolves them at compile time (`scripts/build-server.mjs`)
2. **Drizzle schema** is the source of truth in `packages/shared/schema/` — don't duplicate type definitions
3. **Firebase Auth** is identity-only — all user data lives in PostgreSQL, not Firestore
4. **Socket.io** requires `ALLOWED_ORIGINS` in production or all connections are rejected
5. **Rate limiting** uses `express-rate-limit` + `rate-limit-redis` in production
6. **`pnpm run verify`** is the pre-merge gate — CI failures override deadlines

## Working on a Task

1. Read this file (done automatically)
2. If touching a specific module, read the relevant files in that directory
3. Run `pnpm run typecheck` before committing
4. Run `pnpm test` for the affected module
5. Run `pnpm run verify` before marking complete
