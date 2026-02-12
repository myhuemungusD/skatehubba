# 🎮 SkateHubba

**Play S.K.A.T.E. remotely with skaters around the world.**

The first app built for remote, async skateboarding battles. Challenge anyone, anywhere—record tricks on your schedule, judge opponents' attempts, and compete without being at the same spot. No coordination needed. Just you, your board, and skaters worldwide.

> **What makes us different:** While other skate apps just show you spot maps, **SkateHubba lets you compete remotely** with video-based S.K.A.T.E. games. Play against skaters in different cities, countries, or time zones—asynchronously, on your own schedule.

---

## 🎯 Core Features

### 🎮 Remote S.K.A.T.E. (Our Main Feature)

**Play the classic game of S.K.A.T.E. with anyone, anywhere, anytime.**

- **Challenge Anyone, Anywhere:** Play against skaters in different cities, time zones, or countries
- **Video-Based Gameplay:** Record your tricks (up to 30s), no honor system—video is proof
- **Async Turn-Based:** Play when you're free, no need to coordinate schedules
- **Judgement System:** Opponents judge your tricks as LAND or BAIL
- **Dispute Resolution:** Challenge unfair judgements with admin review
- **Real-Time Updates:** Socket.io notifications when it's your turn
- **Full Game History:** Every trick, every judgement, saved forever

**How it works:**
1. Challenge a skater from the lobby
2. Record your trick attempt and upload
3. Opponent judges it (LAND or BAIL)
4. If LAND, they must attempt the same trick
5. You judge their attempt
6. First to spell S.K.A.T.E. loses

[Learn the full rules →](docs/GAME_RULES.md)

---

### 📍 Spot Map

Browse skate spots on an interactive map. Filter by type (ledge, rail, stair set, park, etc.) and tier. Spots are sourced from OpenStreetMap and can be discovered via geolocation.

### ✅ Check-ins

Check in at a spot when you're within 30 meters. Each check-in is geo-verified and counts toward your streak, XP, and leaderboard rank. Daily limits prevent abuse.

### 🏆 Leaderboard

Real-time rankings across XP, spot count, and streaks. See who's putting in work city-wide.

### 🎬 TrickMint

Upload skateboarding trick videos to the public feed. Build your trick library and share your progression with the community.

---

## 🆚 How We Compare to Other Skate Apps

| Feature | SkateHubba | Shred Spots | The Spot Guide | Skately |
|---------|-----------|-------------|----------------|---------|
| **Remote S.K.A.T.E. Games** | ✅ 🎮 | ❌ | ❌ | ❌ |
| **Async Turn-Based Gameplay** | ✅ 🎮 | ❌ | ❌ | ❌ |
| **Video-Based Trick Judgement** | ✅ 🎮 | ❌ | ❌ | ❌ |
| **Dispute Resolution** | ✅ | ❌ | ❌ | ❌ |
| **Real-Time Game Updates** | ✅ | ❌ | ❌ | ❌ |
| **Spot Map** | ✅ | ✅ | ✅ | ✅ |
| **Check-ins** | ✅ | ✅ | ✅ | ✅ |
| **Leaderboard** | ✅ | ✅ | ❌ | ❌ |
| **Video Uploads** | ✅ | ❌ | ❌ | ❌ |

**Bottom line:** Other apps help you find spots. **SkateHubba lets you compete remotely.**

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

## 📚 Documentation

- **[Game Rules](docs/GAME_RULES.md)** - Learn how S.K.A.T.E. works on SkateHubba
- **[Architecture](docs/ARCHITECTURE.md)** - System design with Mermaid diagrams
- **[Roadmap](ROADMAP.md)** - Upcoming features and vision
- **[Changelog](CHANGELOG.md)** - What's been built (v0.9.0)
- **[Deployment](docs/DEPLOYMENT_RUNBOOK.md)** - Production deployment guide
- **[Contributing](CONTRIBUTING.md)** - Development workflow and standards
- **[Security](docs/security/SECURITY.md)** - Security policies and reporting

---

## 🎬 Demo & Screenshots

> **Note:** Screenshots coming soon! See [docs/screenshots/README.md](docs/screenshots/README.md) for how to contribute.

Want to see remote S.K.A.T.E. in action? We're preparing:
- Hero GIF showing full remote game flow (record → judge → letter awarded)
- Game lobby screenshots showing worldwide matchups
- Mobile app mockups
- 3-minute demo video walkthrough of a remote battle

**Help wanted:** If you have access to the app, capture screenshots and open a PR!

---

## 🚀 What's Next

See our [Roadmap](ROADMAP.md) for upcoming features, including:
- **Q1 2026:** Mobile app (React Native), spectator mode, game stats
- **Q2 2026:** Tournament mode, trick recognition AI, crew battles
- **Q3 2026:** Premium tiers, analytics dashboard, sponsor integration
- **Q4 2026:** New game modes (Speed S.K.A.T.E., Tag Team), global expansion

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup and workflow
- Branch naming conventions (feat/, fix/, refactor/, chore/)
- Conventional Commits specification
- Code quality standards (no `any` types, functional components)
- PR process with CI validation

All PRs must pass:
- ✅ TypeScript type checking
- ✅ ESLint linting (zero warnings)
- ✅ Unit tests (136 test files)
- ✅ Secret scanning (Gitleaks)
- ✅ Build verification

---

## 🔒 Security

See [docs/security/SECURITY.md](docs/security/SECURITY.md) for:
- Reporting vulnerabilities
- Security features (rate limiting, CSRF, email verification)
- Firestore and Storage security rules
- Multi-layer secret scanning

---

## 📄 License

See [LICENSE](LICENSE).

## Trademark

SkateHubba™ is a trademark of Design Mainline LLC.
