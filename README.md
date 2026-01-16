# 🛹 SkateHubba™

> A skater-built platform merging AR rewards, remote S.K.A.T.E. battles, spot discovery, and community progression.

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
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
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
- and an **AR reward layer** (ghosts/replays anchored to places where possible).

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

### Gameplay + Social

- **Remote Game of S.K.A.T.E.**
  - 1v1 battles, play-by-play, reply windows
  - vote/judging mechanics

- **Spot Map + Check-ins**
  - location-based check-in validation
  - streaks, leaderboards, city rankings

- **AR / Trick "Ghosts"**
  - an aspirational reward layer (not required for onboarding)
  - designed to be vendor-agnostic

- **AI Skate Buddy ("Hesher")**
  - skate-specific Q&A and coaching direction (evolves over time)

- **Identity + Profile**
  - skater profile, credibility, future "verified" paths

- **E-commerce (planned)**
  - culture-aligned drops/collabs and shop discovery

### Engineering + Safety (Implemented)

- **Enterprise environment separation guardrails**
  - fail-fast startup validation (`assertEnvWiring()`)
  - environment namespacing for Firestore + Storage (`getEnvPath()`, `getStoragePath()`)
  - write-path validation (`validateWritePath()`)
  - non-prod environment banner (staging/local)

---

## Tech Stack

- **Web:** React + Vite + TypeScript
- **Backend:** Node + Express
- **Auth:** Firebase Auth
- **Profiles / realtime:** Firestore
- **Structured data:** PostgreSQL + Drizzle
- **Storage:** Firebase Storage (media uploads)
- **Maps:** Leaflet
- **Payments (shop):** Stripe
- **Monitoring:** Sentry (ready)
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

### Prereqs

- Node.js **20+**
- pnpm

### Install

From repo root:

```bash
pnpm install
```

Run web client:

```bash
pnpm -C client dev
```

Build web client:

```bash
pnpm -C client build
```

If you also run the API locally, use the scripts defined in the root `package.json` / server package.

---

## Environment Separation

SkateHubba uses origin-stable environments. We do not chase disposable preview URLs for auth testing.

| Environment    | Domain                   | Purpose                              |
| -------------- | ------------------------ | ------------------------------------ |
| **Production** | `skatehubba.com`         | persistent auth                      |
| **Staging**    | `staging.skatehubba.com` | persistent auth + investor demos     |
| **Previews**   | `*.vercel.app`           | UI checks only; re-login is expected |

### Namespaced data model

Firestore + Storage are namespaced by environment:

- `prod` → `/env/prod/...`
- `staging` → `/env/staging/...`
- `local` → emulator/dev only (do not rely on `/env/local` in hosted prod rules)

**Docs:** [ENVIRONMENT_SEPARATION.md](docs/ENVIRONMENT_SEPARATION.md)

**Shared env utilities:** `@skatehubba/config` (`assertEnvWiring()`, `getEnvPath()`, `validateWritePath()`)

---

## Environment Variables

Client-visible variables use only `EXPO_PUBLIC_*` (web + Expo mobile compatibility).  
Server secrets must **never** use `EXPO_PUBLIC_*`.

### Client (public)

Configured via Vercel (Prod/Staging), and via local `.env` where applicable.

Typical keys:

- `EXPO_PUBLIC_APP_ENV` (`prod` | `staging` | `local`)
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_CANONICAL_ORIGIN`
- `EXPO_PUBLIC_FIREBASE_APP_ID_PROD`
- `EXPO_PUBLIC_FIREBASE_APP_ID_STAGING`
- `EXPO_PUBLIC_SENTRY_DSN` (if used client-side)
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (publishable only)

### Server (private)

Examples (var names may differ by deployment setup):

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `SENTRY_DSN`
- Firebase Admin credentials / service account (server-only)

A repo script validates that secrets are not prefixed with public prefixes:

```bash
node scripts/validate-env-secrets.mjs
```

See `.env.example` for the exact current list.

---

## Testing

Run unit tests:

```bash
pnpm test
```

Typecheck (client):

```bash
pnpm -C client typecheck
```

---

## Deployment

- Web deploys via **Vercel**
- CI via **GitHub Actions**
- Staging is treated as the "workhorse" environment for QA and demos

---

## Security

- **CodeQL** enabled
- **Guardrails** prevent env miswiring (fail-fast)
- **Path validation** prevents cross-environment writes (namespaced data model)

If you find a security issue, use [GitHub Security Advisories](https://github.com/myhuemungusD/skatehubba1/security).

---

## Contributing

PRs welcome. Keep changes small and auditable:

- run tests
- avoid committing caches/build output
- follow repo conventions

---

## License

MIT — see [LICENSE](LICENSE).

---

## Trademark

**SkateHubba™** is a trademark of Design Mainline LLC.  
USPTO Serial No. 99356919 (Classes 009 & 041).
