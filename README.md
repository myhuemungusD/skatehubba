# 🛹 SkateHubba™

> The ultimate skateboarding platform merging AR gameplay, social interaction, and skate culture.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![CI](https://github.com/myhuemungusD/skatehubba1/actions/workflows/ci.yml/badge.svg)](https://github.com/myhuemungusD/skatehubba1/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/Tests-133%20passing-brightgreen.svg)](./vitest.config.mts)
[![Coverage](https://img.shields.io/badge/Coverage-3%25-red.svg)](./vitest.config.mts)
[![CodeQL](https://github.com/myhuemungusD/skatehubba1/actions/workflows/codeql.yml/badge.svg)](https://github.com/myhuemungusD/skatehubba1/security/code-scanning)
[![Security](https://img.shields.io/badge/Vulnerabilities-0-brightgreen.svg)](https://github.com/myhuemungusD/skatehubba1/security)

**Owner:** Jason Hamilton  
**Entity:** Design Mainline LLC  
**Trademark SN:** 99356919

---

## Table of Contents

- [What is SkateHubba](#what-is-skatehubba)
- [Core Product Loop](#core-product-loop)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Repo Structure](#repo-structure)
- [Local Development](#local-development)
- [Environment Separation](#environment-separation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Trust & Safety](#trust--safety)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Trademark](#trademark)

---

## What is SkateHubba

SkateHubba is a skater-built platform that combines:

- a **vertical clip feed** (skate-first, not generic social),
- **remote Game of S.K.A.T.E. battles** with community judging,
- **spot discovery + check-ins** for real-world progression,
- and an **AR reward layer** (ghosts/replays anchored to places).

The long-term goal is to own the **skate graph**: tricks, spots, battles, judging outcomes, reputation, and crew influence.

---

## Core Product Loop

1. **Watch** clips (feed)
2. **Battle** (remote S.K.A.T.E.)
3. **Judge / vote** (community validation)
4. **Check in** at spots (streaks + rep)
5. **Share/export** clips (growth engine)
6. Repeat

---

## Key Features

- **Remote Game of S.K.A.T.E.**
  - 1v1 battles, play-by-play, reply windows
  - vote/judging mechanics

- **Spot Map + Check-ins**
  - location-based check-in validation
  - streaks, leaderboards, city rankings

- **AR / Trick “Ghosts”**
  - an aspirational reward layer (not required for onboarding)
  - designed to be vendor-agnostic

- **AI Skate Buddy (“Hesher”)**
  - skate-specific Q&A and coaching direction (evolves over time)

- **Identity + Profile**
  - skater profile, credibility, future “verified” paths

- **E-commerce (planned)**
  - culture-aligned drops/collabs and shop discovery

---

## Tech Stack

- **Web:** React + Vite + TypeScript
- **Backend:** Node / Express (plus real-time infra where applicable)
- **Auth:** Firebase Auth
- **Profiles / realtime:** Firestore
- **Structured data:** PostgreSQL + Drizzle
- **Storage:** Firebase Storage (media uploads)
- **CI/Security:** GitHub Actions + CodeQL

---

## Repo Structure

> Exact folders may evolve, but the intent is consistent:

- `client/` — web app (Vite/React)
- `server/` — API + services
- `packages/` — shared code (types, config, utilities)
  - `@skatehubba/config` — universal env loader + guardrails

---

## Local Development

### Prerequisites

- Node.js **20+**
- pnpm

### Install

From repo root:

```bash
pnpm install
```

### Run (Web)

```bash
pnpm dev
```

## Testing

```bash
pnpm test
```

## Deployment

See [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md).

## Trust & Safety

See [docs/TRUST_AND_SAFETY.md](docs/TRUST_AND_SAFETY.md) for the MVP plan covering verification, reporting, moderation queues, trust levels, and content policy enforcement.

## Security

See [docs/security/SECURITY.md](docs/security/SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).

## Trademark

SkateHubba™ is a trademark of Design Mainline LLC.
