# System Architecture

What runs where, how data flows, and the trust boundaries between components.

For the game-specific architecture (state machine, turn flow, concurrency), see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## What Runs Where

| Component | Runtime | Entry Point | Responsibility |
|-----------|---------|-------------|----------------|
| **Web client** | Browser | `client/src/main.tsx` | React SPA. Vite build, served as static files from `client/dist/`. |
| **Mobile client** | iOS / Android | `mobile/app/_layout.tsx` | React Native + Expo. Same API surface as web. |
| **Express server** | Node.js 20 | `server/index.ts` | HTTP API, Socket.io, video processing, static file serving. Single process. |
| **Cloud Functions** | Firebase Functions | `functions/src/index.ts` | RBAC role management, App Check enforcement, Firestore triggers. |
| **Cron jobs** | Express (in-process) | `server/routes/games-cron.ts` | Game deadline enforcement, turn timeout forfeit. |

### In staging/production the server runs inside Docker

```
Nginx (TLS termination, port 80/443)
  └─> Express app container (port 3001)
        ├── Serves client/dist/ as static files
        ├── Serves /api/* endpoints
        └── Runs Socket.io on same port
```

See `Dockerfile` and `docker-compose.staging.yml` for the full container definition.

---

## Data Flow

### Request lifecycle

```
Client (browser/mobile)
  │
  ├── Firebase Auth SDK ──> Firebase Auth (get ID token)
  │
  ├── HTTPS ──> Express API
  │     ├── CSRF double-submit cookie check (state-changing requests)
  │     ├── Firebase ID token verification (server/auth/middleware.ts)
  │     ├── Rate limiting (server/middleware/security.ts)
  │     ├── Zod request validation (server/middleware/validation.ts)
  │     ├── Business logic ──> PostgreSQL (Drizzle ORM)
  │     └── Side effects ──> Firestore projection, Firebase Storage, Stripe, email
  │
  └── WebSocket ──> Socket.io server
        ├── Firebase token auth on connect (server/socket/auth.ts)
        ├── Room-based events (game updates, presence)
        └── Redis adapter for multi-instance (when scaled)
```

### Write path

All writes go to PostgreSQL first. Firestore receives a projection after the primary write succeeds.

```
API handler
  1. Validate input (Zod)
  2. Begin PostgreSQL transaction
  3. Write to PostgreSQL (source of truth)
  4. Commit transaction
  5. Sync projection to Firestore (if real-time subscription needed)
  6. Emit Socket.io event (if push notification needed)
```

See [DATA_BOUNDARIES.md](architecture/DATA_BOUNDARIES.md) for the canonical field-level ownership map.

---

## Auth & Session Model

### Identity

Firebase Auth is the identity provider. The server never stores passwords. Supported methods:

- Email / password (with email verification required)
- Google OAuth
- Phone number (SMS OTP)
- MFA via TOTP (server/auth/routes/mfa.ts)

### Session flow

```
1. Client authenticates via Firebase Auth SDK → receives Firebase ID token
2. Client sends POST /api/auth/login with Bearer token
3. Server verifies token via firebase-admin verifyIdToken()
4. Server looks up or creates user in PostgreSQL (customUsers + userProfiles)
5. Server issues a JWT session token (signed with JWT_SECRET)
6. Client stores JWT and sends it on subsequent requests via Authorization header
7. CSRF token set as cookie, client echoes it in X-CSRF-Token header on mutations
```

### Token lifetimes

| Token | Lifetime | Storage |
|-------|----------|---------|
| Firebase ID token | 1 hour (auto-refreshed by SDK) | Client memory |
| JWT session token | 24 hours (`server/auth/service.ts`) | Client localStorage |
| CSRF token | Session-scoped | Cookie (httpOnly=false for JS read) |

### Authorization

- Role-based access control: `user`, `admin`, `moderator`, `verified_pro`
- Roles stored as Firebase custom claims (set via Cloud Functions)
- Resource ownership checked at the API layer (users can only modify their own data)
- Email verification required for content creation (spots, check-ins, game participation)

### Security controls

- Rate limiting: global (100 req/15 min), per-user (20 req/min), auth-specific, spot-write-specific
- Account lockout after repeated failed logins (`server/auth/lockout.ts`)
- Audit logging for all auth events (`server/auth/audit.ts`)
- Mock tokens blocked outside `development`/`test` NODE_ENV

---

## Storage & Video Pipeline

### Storage layout

Firebase Storage is the blob store. Paths are defined in `storage.rules`:

```
/profiles/{userId}/{fileName}          — Profile images (public read, owner write, 5 MB max)
/spots/{spotId}/{fileName}             — Spot images (public read, auth write, 10 MB max)
/uploads/{userId}/{path}               — General uploads (auth read, owner write, 50 MB max)
/videos/{userId}/{gameId}/{roundId}/{fileName} — S.K.A.T.E. trick videos (signed-URL read only, owner write, 100 MB max)
/public/{path}                         — Static assets (public read, no write)
```

Firestore paths are namespaced by environment using `getEnvPath()` from `@skatehubba/config` (e.g. `env/prod/users/...`).

### Video upload and processing

```
Client                           Server                         Firebase Storage
  │                                │                                │
  ├── Record trick (30s max) ──────┤                                │
  ├── Upload video ────────────────┼── Firebase Storage SDK ────────>│
  │                                │                                │
  ├── POST /api/trickmint/upload ──┤                                │
  │   { videoUrl, description }    │                                │
  │                                ├── Validate metadata            │
  │                                ├── Insert into PostgreSQL       │
  │                                ├── Queue processing job         │
  │                                │                                │
  │                          processVideoJob()                      │
  │                                ├── probeVideo() (ffprobe)       │
  │                                │   └── Extract duration, codec, │
  │                                │       resolution, bitrate      │
  │                                ├── transcodeVideo() (ffmpeg)    │
  │                                │   └── Normalize to H.264/AAC  │
  │                                │       MP4 with size limits     │
  │                                ├── generateThumbnail()          │
  │                                │   └── Extract first frame JPEG │
  │                                ├── Upload processed files ──────>│
  │                                └── Update DB with final URLs    │
```

**Requirements:** ffmpeg and ffprobe must be installed on the server host.

**Key files:**
- `server/services/videoTranscoder.ts` — probe, transcode, thumbnail generation
- `server/services/videoProcessingService.ts` — job orchestration
- `server/routes/trickmint.ts` — upload API endpoints
- `server/middleware/bandwidth.ts` — bandwidth detection for adaptive quality

### Video constraints

| Property | Limit |
|----------|-------|
| Max duration | 30 seconds |
| Accepted formats | MP4, WebM, MOV |
| Output format | H.264 video + AAC audio, MP4 container |
| Thumbnail | JPEG, first frame |

---

## Boundaries

### Trust boundaries

```
┌─────────────────────────┐
│  Untrusted: Client      │  Browser JS, mobile app, user input
│  - All input validated  │
│  - Firebase token only  │
│    proof of identity    │
└──────────┬──────────────┘
           │ HTTPS + WSS
┌──────────▼──────────────┐
│  Trusted: Express API   │  Server-side only
│  - Owns all writes      │
│  - Verifies tokens      │
│  - Enforces rate limits │
│  - Runs transactions    │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│  Data stores            │
│  - PostgreSQL (primary) │
│  - Firestore (realtime) │
│  - Firebase Storage     │
│  - Redis (cache)        │
└─────────────────────────┘
```

### Network boundaries

| From | To | Protocol | Auth |
|------|----|----------|------|
| Client | Express API | HTTPS | Bearer JWT + CSRF |
| Client | Socket.io | WSS | Firebase token on handshake |
| Client | Firebase Auth | HTTPS | Firebase SDK |
| Client | Firebase Storage | HTTPS | Firebase SDK (user-scoped rules) |
| Express | PostgreSQL | TCP/TLS | Connection string (`DATABASE_URL`) |
| Express | Firestore | HTTPS | Firebase Admin SDK (service account) |
| Express | Firebase Storage | HTTPS | Firebase Admin SDK |
| Express | Redis | TCP | `REDIS_URL` |
| Express | Stripe | HTTPS | `STRIPE_SECRET_KEY` |
| Express | Resend | HTTPS | `RESEND_API_KEY` |
| Cloud Functions | Firestore | Internal | Firebase Admin SDK |

### Firestore security rules

Clients can read most data under `/env/{env}/` but cannot write to protected collections:
- `/env/prod/billing`, `/env/prod/admin`, `/env/prod/moderation`, `/env/prod/analytics_events`

All client-side writes to Firestore go through owner-path checks and content-type constraints. See `firestore.rules` and `storage.rules`.

---

## Related Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — Game system architecture, state machine, Mermaid diagrams
- [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md) — Hybrid PostgreSQL/Firebase strategy, cost analysis
- [DATA_BOUNDARIES.md](architecture/DATA_BOUNDARIES.md) — Field-level ownership map
- [ENVIRONMENT_SEPARATION.md](ENVIRONMENT_SEPARATION.md) — Environment isolation and config
- [RELEASE.md](RELEASE.md) — Environments, deployments, and secret rotation
