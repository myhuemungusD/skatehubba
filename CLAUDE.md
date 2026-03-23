# CLAUDE.md — SkateHubba™ MVP Codebase

> Claude Code reads this file automatically. Do not scan the full codebase unless a task specifically requires it.

## Product

SkateHubba™ is "Strava for skateboarding" — a location-based social network where skaters find spots and compete via async S.K.A.T.E. games. Owned by Design Mainline LLC.

**MVP scope**: Auth + Spot Map + Multiplayer S.K.A.T.E. game (2-5 players). That's it. Everything else renders as "Coming Soon" placeholder.

## Architecture

```
skatehubba/
├── client/              # React 18 + Vite 6 + TypeScript + Tailwind (SPA)
│   └── src/
│       ├── components/  # game/, map/, layout/, ui/
│       ├── pages/       # AuthPage, HubPage, PlayPage, GamePage, MapPage, etc.
│       ├── hooks/       # useAuth, useSkateGame
│       ├── lib/         # api/client, firebase/config
│       └── store/       # authStore (Zustand)
├── server/              # Express API + PostgreSQL
│   ├── admin.ts         # Firebase Admin SDK init
│   ├── app.ts           # Express factory (CORS, JSON, routes, error handler)
│   ├── auth/            # middleware.ts (Firebase ID token), service.ts
│   ├── config/          # env.ts, constants.ts
│   ├── db.ts            # Neon serverless pool + Drizzle ORM
│   ├── routes/          # games.ts, games-turns.ts, games-shared.ts, spots.ts
│   ├── routes.ts        # Route registration (auth, profile, games, spots)
│   ├── services/        # gameTurnService.ts (multiplayer S.K.A.T.E. logic)
│   └── utils/           # apiError.ts
├── packages/shared/     # Drizzle schema + Zod validation
│   └── schema/          # auth.ts, profiles.ts, games.ts, spots.ts, validation.ts
└── drizzle.config.ts
```

## Tech Stack (locked)

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Frontend | React 18, Vite 6, TypeScript 5.9, Tailwind CSS  |
| Maps     | Leaflet + React Leaflet + OSM                    |
| Backend  | Express, TypeScript                               |
| Database | PostgreSQL 16 (Neon) + Drizzle ORM                |
| Auth     | Firebase Auth (identity only) + PostgreSQL users  |
| State    | Zustand (auth), React Query (server state)        |
| Router   | Wouter (lightweight SPA routing)                  |
| Monorepo | pnpm 10+ workspaces, Turborepo                   |

**Not in MVP**: Redis, Socket.io, Stripe, MFA, Sentry, admin dashboard, moderation, video transcoding, trick minting, closet items, battles.

## Key Commands

```bash
pnpm install          # Install deps
pnpm dev              # Start client (3000) + server (3001)
pnpm run typecheck    # TypeScript strict check
pnpm run build        # Production build
pnpm db:generate      # Generate Drizzle migrations
pnpm db:push          # Push schema to DB
```

## S.K.A.T.E. Game Architecture (Multiplayer)

2-5 players, async turn-based. Core logic: `server/services/gameTurnService.ts`.

**Data model**: `games.players` is a JSON array of `GamePlayer` objects:
```typescript
interface GamePlayer {
  id: string;
  name: string;
  letters: string;      // "", "S", "SK", ... "SKATE"
  isEliminated: boolean;
}
```

**Turn flow**:
1. Setter sets a trick (video + description)
2. Each non-setter responds in order (one at a time)
3. Setter judges each response: LAND or BAIL
4. BAIL → responder gets a letter
5. After all responses judged, setter rotates to next active player
6. First to spell S.K.A.T.E. is eliminated. Last standing wins.

**Key design**: one-take video, auto-send, no retries. 24-hour turn deadline.

## API Routes

| Route                              | Auth     | Purpose                        |
| ---------------------------------- | -------- | ------------------------------ |
| POST `/api/auth/login`             | Required | Sync Firebase user to PG       |
| GET `/api/auth/me`                 | Required | Get user + profile             |
| POST `/api/profile`                | Required | Create/update profile          |
| GET `/api/profile/:handle`         | Public   | Public profile lookup          |
| POST `/api/games/create`           | Required | Create multiplayer game        |
| POST `/api/games/:id/join`         | Required | Accept/decline game invite     |
| POST `/api/games/:id/turns`        | Required | Submit trick video             |
| POST `/api/games/turns/:id/judge`  | Required | Judge LAND or BAIL             |
| POST `/api/games/:id/setter-bail`  | Required | Setter bails (takes letter)    |
| POST `/api/games/:id/forfeit`      | Required | Forfeit game                   |
| GET `/api/games/my-games`          | Required | List user's games              |
| GET `/api/games/:id`               | Required | Game details + turns           |
| GET `/api/games/leaderboard`       | Required | Top players by wins            |
| GET `/api/spots`                   | Public   | List all spots                 |
| GET `/api/spots/:id`               | Public   | Spot detail                    |
| POST `/api/spots`                  | Required | Create a spot                  |
| POST `/api/spots/:id/rate`         | Required | Rate a spot (1-5)              |
| POST `/api/spots/:id/check-in`     | Required | Check in at a spot             |

## Auth Flow

Firebase Auth (identity only) → Express middleware verifies Firebase ID token → looks up user in PostgreSQL. No session cookies, no Redis, no MFA.

## Environment

- Node.js ≥ 22
- pnpm ≥ 10
- `.env` from `.env.example` — Firebase credentials, DATABASE_URL, JWT_SECRET, SESSION_SECRET

## Coding Standards

- `any` is forbidden
- Guard clauses + early returns, no deep nesting
- Mobile-first, touch targets ≥ 44px
- Conventional commits, all-lowercase
