<p align="center">
  <strong>S K A T E H U B B A</strong>
</p>

<p align="center">
  The first async, turn-based S.K.A.T.E. game for skaters worldwide.
</p>

<p align="center">
  <a href="https://github.com/myhuemungusD/skatehubba/actions/workflows/ci.yml"><img src="https://github.com/myhuemungusD/skatehubba/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/myhuemungusD/skatehubba/actions/workflows/codeql.yml"><img src="https://github.com/myhuemungusD/skatehubba/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/myhuemungusD/skatehubba/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://staging.skatehubba.com"><img src="https://img.shields.io/badge/demo-staging.skatehubba.com-f59e0b" alt="Demo"></a>
</p>

---

Other skate apps help you find spots. **SkateHubba lets you compete remotely.**

Challenge anyone to a game of S.K.A.T.E. — record tricks on video, judge your opponent's attempts, and battle asynchronously across cities, countries, and time zones. No need to be at the same spot. No need to coordinate schedules. Just you, your board, and skaters worldwide.

---

## How It Works

```
1. Challenge a skater        4. They must match your trick
2. Record your trick (≤30s)  5. You judge their attempt
3. Opponent judges: LAND/BAIL 6. First to spell S.K.A.T.E. loses
```

> Full rules: [docs/GAME_RULES.md](docs/GAME_RULES.md)

---

## Features

|             | Feature            | Description                                                   |
| ----------- | ------------------ | ------------------------------------------------------------- |
| **Game**    | Remote S.K.A.T.E.  | Async turn-based gameplay with video proof — no honor system  |
|             | Dispute Resolution | Challenge unfair calls with admin review                      |
|             | Real-Time Updates  | Socket.io notifications when it's your turn                   |
|             | Full History       | Every trick, every judgement, saved forever                   |
| **Social**  | TrickMint          | Upload trick videos to the public feed                        |
|             | Leaderboard        | Real-time rankings by XP, spots, and streaks                  |
| **Explore** | Spot Map           | Interactive map with filters by type and tier (Leaflet + OSM) |
|             | Check-ins          | Geo-verified check-ins within 30m — earn XP and streaks       |

---

## Tech Stack

| Layer      | Technology                                               |
| ---------- | -------------------------------------------------------- |
| Frontend   | React 18, Vite 6, TypeScript 5.9, TailwindCSS, Leaflet   |
| Backend    | Express, TypeScript, PostgreSQL 16, Drizzle ORM, Redis 7 |
| Mobile     | React Native, Expo (EAS builds)                          |
| Auth       | Firebase Auth + custom JWT                               |
| Realtime   | Socket.io                                                |
| Monorepo   | pnpm workspaces, Turborepo                               |
| Build      | esbuild (server), Vite (client)                          |
| Testing    | Vitest, Playwright, Cypress, Detox (mobile)              |
| CI/CD      | GitHub Actions, CodeQL, Docker (staging), Vercel (prod)  |
| Monitoring | Sentry                                                   |

---

## Repo Structure

```text
client/      Web app (Vite / React)
server/      Express API + PostgreSQL backend
mobile/      React Native / Expo app
functions/   Firebase Cloud Functions
packages/    Shared code (config, db, firebase, shared, types, utils)
migrations/  PostgreSQL migration scripts
scripts/     Build, validation, and deployment scripts
docs/        Architecture, security, setup guides
deploy/      Docker / Nginx deployment config
e2e/         Playwright E2E tests
```

---

## Local Development

### Prerequisites

- Node.js 20+ (`.nvmrc` included)
- pnpm 10+ (enforced — `npm install` and `yarn` will fail)

### Install

```bash
# Prerequisites: Node.js 20+, pnpm 10+
pnpm install
```

### Configure environment

```bash
cp .env.example .env
# Edit .env with your Firebase, database, and other credentials
```

### Run

```bash
pnpm dev
```

This starts both the Vite dev server (client on port 3000) and the Express API (server on port 3001) via Turborepo.

---

## Project Structure

```bash
pnpm test              # Run all unit tests (Vitest)
pnpm test:watch        # Watch mode
pnpm test:coverage     # Run with coverage report
```

Coverage thresholds enforced in CI: statements 98%, branches 93%, functions 99%, lines 99%.

### Full verification (pre-merge)

```bash
pnpm run verify        # typecheck + lint + test + build
```

skatehubba/
├── client/ React web app (Vite)
├── server/ Express API + PostgreSQL
├── mobile/ React Native / Expo app
├── functions/ Firebase Cloud Functions
├── packages/
│ ├── config/ Shared configuration
│ ├── db/ Drizzle schema & queries
│ ├── firebase/ Firebase client helpers
│ ├── shared/ Shared business logic
│ ├── types/ Shared TypeScript types
│ └── utils/ Shared utilities
├── migrations/ PostgreSQL migrations
├── e2e/ Playwright end-to-end tests
├── deploy/ Docker / Nginx / SSL config
├── scripts/ Build, validation & deploy scripts
└── docs/ Architecture, security & setup guides

````

---

## Deployment

`pnpm run verify` is the pre-flight check for CI.

**Production** — Vercel auto-deploys on push to `main`. Build command: `node scripts/verify-public-env.mjs && pnpm --filter skatehubba-client build`. Output: `client/dist`.

**Staging** — Docker Compose via `deploy-staging.yml` workflow on push to `staging`.

See [docs/RELEASE.md](docs/RELEASE.md) for environments, deployment pipelines, and secret rotation.

### Staging (Public Demo)

The staging environment runs on Docker Compose
with PostgreSQL, Redis, Nginx, and automatic SSL via Let's Encrypt.

**Quick start on a fresh Ubuntu server:**

```bash
# One-liner for a fresh Ubuntu server:
DOMAIN=staging.skatehubba.com EMAIL=admin@skatehubba.com bash deploy/setup-server.sh
````

See [docs/RELEASE.md](docs/RELEASE.md) for full deployment docs, environments, and secret rotation.

**Live demo:** [staging.skatehubba.com](https://staging.skatehubba.com)

---

## Documentation

| Document                                           |                                               |
| -------------------------------------------------- | --------------------------------------------- |
| [Game Rules](docs/GAME_RULES.md)                   | How S.K.A.T.E. works on SkateHubba            |
| [System Architecture](docs/SYSTEM_ARCHITECTURE.md) | Boundaries, data flow, auth, video pipeline   |
| [Game Architecture](docs/ARCHITECTURE.md)          | Game system design with Mermaid diagrams      |
| [Release & Deployment](docs/RELEASE.md)            | Environments, pipelines, secret rotation      |
| [Deployment Runbook](docs/DEPLOYMENT_RUNBOOK.md)   | Incident response and troubleshooting         |
| [Security](docs/security/SECURITY.md)              | Security policies and vulnerability reporting |
| [Contributing](CONTRIBUTING.md)                    | Dev workflow, branch conventions, PR process  |
| [Changelog](CHANGELOG.md)                          | Release history                               |
| [Roadmap](ROADMAP.md)                              | What's next                                   |

---

## Roadmap

| Quarter     | Highlights                                                      |
| ----------- | --------------------------------------------------------------- |
| **Q1 2026** | Mobile app (React Native), spectator mode, game stats dashboard |
| **Q2 2026** | Tournament brackets, trick recognition AI, crew battles         |
| **Q3 2026** | Premium tiers, player analytics, sponsor integrations           |
| **Q4 2026** | Speed S.K.A.T.E., tag team mode, global expansion               |

Full details: [ROADMAP.md](ROADMAP.md)

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```bash
# All PRs must pass:
pnpm -w run verify   # typecheck + lint + test + build
```

- TypeScript type checking (strict mode, no `any`)
- ESLint linting (zero warnings)
- Prettier formatting check
- Unit tests with coverage thresholds (98% statements)
- Bundle size budget check
- Migration drift check
- Secret scanning (Gitleaks)
- Build verification

---

## Security

Report vulnerabilities via [docs/security/SECURITY.md](docs/security/SECURITY.md).

Built-in protections: rate limiting, CSRF tokens, email verification, Firestore & Storage security rules, multi-layer secret scanning (Gitleaks + Secretlint).

---

## License

[MIT](LICENSE) — SkateHubba™ is a trademark of Design Mainline LLC.
