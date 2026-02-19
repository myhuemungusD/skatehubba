# SkateHubba

**Play S.K.A.T.E. remotely with skaters around the world.**

[![Try Demo](https://img.shields.io/badge/Try%20Demo-staging.skatehubba.com-f59e0b?style=for-the-badge&logo=skateboarding)](https://staging.skatehubba.com)
[![CI](https://github.com/myhuemungusD/skatehubba/actions/workflows/ci.yml/badge.svg)](https://github.com/myhuemungusD/skatehubba/actions/workflows/ci.yml)

The first app built for remote, async skateboarding battles.
Challenge anyone, anywhere — record tricks on your schedule,
judge opponents' attempts, and compete without being at the same spot.
No coordination needed. Just you, your board, and skaters worldwide.

> **What makes us different:** While other skate apps show you
> spot maps, **SkateHubba lets you compete remotely** with video-based
> S.K.A.T.E. games. Play against skaters in different cities, countries,
> or time zones — asynchronously, on your own schedule.

---

## Core Features

### Remote S.K.A.T.E.

**Play the classic game of S.K.A.T.E. with anyone, anywhere, anytime.**

- **Challenge Anyone, Anywhere** —
  Play against skaters in different cities, time zones, or countries
- **Video-Based Gameplay** —
  Record your tricks (up to 30 s); no honor system, video is proof
- **Async Turn-Based** —
  Play when you are free, no need to coordinate schedules
- **Judgement System** —
  Opponents judge your tricks as LAND or BAIL
- **Dispute Resolution** —
  Challenge unfair judgements with admin review
- **Real-Time Updates** —
  Socket.io notifications when it is your turn
- **Full Game History** —
  Every trick, every judgement, saved forever

**How it works**

1. Challenge a skater from the lobby
2. Record your trick attempt and upload
3. Opponent judges it (LAND or BAIL)
4. If LAND, they must attempt the same trick
5. You judge their attempt
6. First to spell S.K.A.T.E. loses

[Learn the full rules →](docs/GAME_RULES.md)

---

### Spot Map

Browse skate spots on an interactive map.
Filter by type (ledge, rail, stair set, park, etc.) and tier.
Spots are sourced from OpenStreetMap and can be discovered
via geolocation.

### Check-ins

Check in at a spot when you are within 30 meters.
Each check-in is geo-verified and counts toward your streak,
XP, and leaderboard rank. Daily limits prevent abuse.

### Leaderboard

Real-time rankings across XP, spot count, and streaks.
City-wide leaderboards surface the most active skaters.

### TrickMint

Upload skateboarding trick videos to the public feed.
Build your trick library and share your progression
with the community.

---

## Feature Comparison

| Feature                          | SkateHubba | Shred Spots | The Spot Guide | Skately |
| -------------------------------- | ---------- | ----------- | -------------- | ------- |
| **Remote S.K.A.T.E. Games**      | Yes        | No          | No             | No      |
| **Async Turn-Based Gameplay**    | Yes        | No          | No             | No      |
| **Video-Based Trick Judgement**  | Yes        | No          | No             | No      |
| **Dispute Resolution**           | Yes        | No          | No             | No      |
| **Real-Time Game Updates**       | Yes        | No          | No             | No      |
| **Spot Map**                     | Yes        | Yes         | Yes            | Yes     |
| **Check-ins**                    | Yes        | Yes         | Yes            | Yes     |
| **Leaderboard**                  | Yes        | Yes         | No             | No      |
| **Video Uploads**                | Yes        | No          | No             | No      |

**Bottom line:** Other apps help you find spots.
**SkateHubba lets you compete remotely.**

---

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | React, Vite, TypeScript, TailwindCSS, Leaflet |
| Backend  | Express, TypeScript, PostgreSQL, Drizzle ORM   |
| Auth     | Firebase Auth                                  |
| Realtime | Socket.io                                      |
| CI       | GitHub Actions, CodeQL                         |

---

## Repo Structure

```text
client/      Web app (Vite / React)
server/      API and services
packages/    Shared code (types, config, utilities)
```

---

## Local Development

### Prerequisites

- Node.js 20+
- pnpm

### Install

```bash
pnpm install
```

### Run

```bash
pnpm dev
```

---

## Testing

```bash
pnpm test
pnpm -w run verify
```

### Cypress E2E

```bash
pnpm --filter skatehubba-client dev -- --host 0.0.0.0 --port 3000
pnpm --filter skatehubba-client exec cypress run
```

---

## Deployment

`pnpm -w run verify` is the pre-flight check for CI.

See [docs/RELEASE.md](docs/RELEASE.md) for environments, deployment pipelines, and secret rotation.

### Staging (Public Demo)

The staging environment runs on Docker Compose
with PostgreSQL, Redis, Nginx, and automatic SSL via Let's Encrypt.

**Quick start on a fresh Ubuntu server:**

```bash
export DOMAIN=staging.skatehubba.com
export EMAIL=admin@skatehubba.com
bash deploy/setup-server.sh
```

**Manual steps:**

```bash
# 1. Point DNS A record for staging.skatehubba.com to your server IP
# 2. Clone the repo and checkout staging branch
git clone https://github.com/myhuemungusD/skatehubba.git /opt/skatehubba
cd /opt/skatehubba && git checkout staging

# 3. Configure secrets
cp .env.staging .env.staging.local
nano .env.staging.local

# 4. Start services
docker compose -f docker-compose.staging.yml up -d

# 5. SSL certificates are managed automatically by the certbot container
```

Live at: **<https://staging.skatehubba.com>**

---

## Documentation

| Document                                              | Description                        |
| ----------------------------------------------------- | ---------------------------------- |
| [Game Rules](docs/GAME_RULES.md)                      | How S.K.A.T.E. works on SkateHubba |
| [System Architecture](docs/SYSTEM_ARCHITECTURE.md)     | Boundaries, data flow, auth, video pipeline |
| [Game Architecture](docs/ARCHITECTURE.md)              | Game system design with Mermaid diagrams |
| [Release & Deployment](docs/RELEASE.md)                | Environments, deploys, secret rotation |
| [Roadmap](ROADMAP.md)                                  | Upcoming features and vision        |
| [Changelog](CHANGELOG.md)                              | Release history (v0.9.0)            |
| [Deployment Runbook](docs/DEPLOYMENT_RUNBOOK.md)       | Incident response and troubleshooting |
| [Contributing](CONTRIBUTING.md)                        | Development workflow and standards   |
| [Security](docs/security/SECURITY.md)                  | Security policies and reporting     |
| [Setup Guides](docs/setup/)                             | Firebase, Google Sign-in, email config |

---

## Demo

**[Try the live staging demo →](https://staging.skatehubba.com)**

The staging environment uses demo data and Stripe test mode —
explore freely without affecting production.

---

## What's Next

See the [Roadmap](ROADMAP.md) for upcoming features, including:

- **Q1 2026** — Mobile app (React Native), spectator mode, game stats
- **Q2 2026** — Tournament mode, trick recognition AI, crew battles
- **Q3 2026** — Premium tiers, analytics dashboard, sponsor integration
- **Q4 2026** — New game modes (Speed S.K.A.T.E., Tag Team), global expansion

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup and workflow
- Branch naming conventions (`feat/`, `fix/`, `refactor/`, `chore/`)
- Conventional Commits specification
- Code quality standards (no `any` types, functional components)
- PR process with CI validation

All PRs must pass:

- TypeScript type checking
- ESLint linting (zero warnings)
- Unit tests (136 test files)
- Secret scanning (Gitleaks)
- Build verification

---

## Security

See [docs/security/SECURITY.md](docs/security/SECURITY.md) for:

- Reporting vulnerabilities
- Security features (rate limiting, CSRF, email verification)
- Firestore and Storage security rules
- Multi-layer secret scanning

---

## License

See [LICENSE](LICENSE).

---

## Trademark

SkateHubba™ is a trademark of Design Mainline LLC.
