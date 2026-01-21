# SkateHubba™

SkateHubba is a skateboarding platform built around remote games of S.K.A.T.E.  
Everything else exists to support that core.

This is not a highlight reel app.  
It is not pay-to-verify.  
It is not hype-driven.

**SkateHubba is about proof, history, and reputation.**

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

---

## Filmer Workflow Spec

### Endpoints

- `POST /api/filmer/request`
- `POST /api/filmer/respond`
- `GET /api/filmer/requests`

### State Machine

- `pending → accepted`
- `pending → rejected`
- Terminal states cannot change.

### Data Fields

- `check_ins.filmerUid`
- `check_ins.filmerStatus`
- `check_ins.filmerRequestedAt`
- `check_ins.filmerRespondedAt`
- `check_ins.filmerRequestId`
- `filmer_requests` table as the system of record

### Abuse Controls

- Daily quota counters with expiry for request/respond actions.
- IP + session rate limits on request/respond endpoints.
- Duplicate protection per `(checkInId, filmerUid)`.

### Failure Modes

- Requests are rejected if the check-in is not owned by the requester.
- Responses are rejected if the filmer is not eligible or the request is not pending.
- Check-in updates and filmer request updates are transactional in PostgreSQL.

### Idempotency

- Creating a request that is already pending returns the existing request ID.
- Creating a request when a prior request is accepted/rejected returns `409`.

### Enterprise Next Steps

- Add Prometheus metrics for request volume and accept rate.
- Add alerts on quota breaches and suspicious rejection spikes.
- Extend filmer eligibility with custom claims for cross-service enforcement.

---

## Environment Separation

- Firestore is reserved for realtime/presence/feed data.
- PostgreSQL is the system of record for server-authoritative workflows.

---

## Testing

### Proof Commands

```bash
pnpm test
pnpm -w run verify
```

### Lint Policy

`pnpm -w run lint` fails on errors only; warnings are non-blocking until the codebase is fully cleaned.

### Cypress E2E

```bash
pnpm --filter skatehubba-client dev -- --host 0.0.0.0 --port 3000
pnpm --filter skatehubba-client exec cypress run
```

> Note: Cypress specs assume the web app is running on `http://localhost:3000` and Firebase emulators are configured when needed.

---

## Deployment

- `pnpm -w run verify` is the pre-flight check for CI.

---

## Security

- All write endpoints require auth + validation.
- Rate limits are enforced on public write paths.

---

## Contributing

- Follow existing lint and formatting rules.
- Keep changes minimal and production-ready.

---

## License

MIT

---

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
