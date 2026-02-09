# SkateHubba

SkateHubba is a spot map for skateboarders. Find spots, check in, and climb the leaderboard.

---

## Features

### Spot Map

Browse skate spots on an interactive map. Filter by type (ledge, rail, stair set, park, etc.) and tier. Spots are sourced from OpenStreetMap and can be discovered via geolocation.

### Check-ins

Check in at a spot when you're within 30 meters. Each check-in is geo-verified and counts toward your streak, XP, and leaderboard rank. Daily limits prevent abuse.

### Leaderboard

Real-time rankings across XP, spot count, and streaks. See who's putting in work city-wide.

---

## Tech Stack

- **Frontend:** React + Vite + TypeScript, TailwindCSS, React Leaflet
- **Backend:** Express + TypeScript, PostgreSQL + Drizzle ORM
- **Auth:** Firebase Auth
- **Realtime:** Socket.io
- **CI:** GitHub Actions + CodeQL

---

## Repo Structure

- `client/` — web app (Vite/React)
- `server/` — API + services
- `packages/` — shared code (types, config, utilities)

---

## Local Development

### Prerequisites

- Node.js **20+**
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

See [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md).

---

## Security

See [docs/security/SECURITY.md](docs/security/SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).

## Trademark

SkateHubba™ is a trademark of Design Mainline LLC.
