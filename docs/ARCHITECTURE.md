# SkateHubba System Architecture

This document provides a high-level overview of SkateHubba's architecture, with a focus on the S.K.A.T.E. game system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [S.K.A.T.E. Game Architecture](#skate-game-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Technology Stack](#technology-stack)
5. [Database Schema](#database-schema)
6. [Security Architecture](#security-architecture)
7. [Deployment Architecture](#deployment-architecture)

---

## System Overview

SkateHubba is a **monorepo** containing multiple packages that work together to deliver an async turn-based video game for skateboarding.

```mermaid
graph TB
    subgraph "Client Applications"
        WebApp[Web App<br/>React + Vite]
        MobileApp[Mobile App<br/>React Native + Expo]
    end

    subgraph "Backend Services"
        API[Express API Server]
        SocketIO[Socket.io Server<br/>Real-time Events]
        CloudFunctions[Firebase Cloud Functions]
    end

    subgraph "Data Layer"
        PostgreSQL[(PostgreSQL<br/>Game State & Users)]
        Firestore[(Firestore<br/>Activity Feed)]
        FirebaseStorage[(Firebase Storage<br/>Video & Images)]
        Redis[(Redis<br/>Cache & Sessions)]
    end

    subgraph "External Services"
        FirebaseAuth[Firebase Auth<br/>Authentication]
        Stripe[Stripe<br/>Payments]
        Resend[Resend<br/>Email]
        Sentry[Sentry<br/>Monitoring]
    end

    WebApp --> API
    MobileApp --> API
    WebApp --> SocketIO
    MobileApp --> SocketIO

    API --> PostgreSQL
    API --> Firestore
    API --> FirebaseStorage
    API --> Redis

    API --> FirebaseAuth
    API --> Stripe
    API --> Resend
    API --> Sentry

    CloudFunctions --> Firestore
    CloudFunctions --> FirebaseStorage
```

---

## S.K.A.T.E. Game Architecture

The game system is the core differentiator of SkateHubba. Here's how it works:

### Game Turn Flow

```mermaid
sequenceDiagram
    participant A as Attacker
    participant Client as Client App
    participant API as Express API
    participant DB as PostgreSQL
    participant Storage as Firebase Storage
    participant Socket as Socket.io
    participant D as Defender

    Note over A,D: Turn Submission Phase
    A->>Client: Record trick video (30s max)
    Client->>Storage: Upload video file
    Storage-->>Client: Return video URL
    Client->>API: POST /api/games/:id/turns<br/>{video_url, trick_description}
    API->>DB: INSERT INTO game_turns
    API->>Socket: Emit "new_turn" event
    Socket-->>D: Notify defender
    API-->>Client: Turn created

    Note over A,D: Judgement Phase
    D->>Client: View attacker's video
    D->>Client: Judge as LAND or BAIL
    Client->>API: POST /api/games/turns/:id/judge<br/>{result: "LAND"}
    API->>DB: BEGIN TRANSACTION<br/>SELECT ... FOR UPDATE (row lock)
    API->>DB: UPDATE game_turns SET judgement

    alt Judgement is LAND
        API->>DB: Defender must attempt trick
        API->>Socket: Emit "judge_result" event
        Socket-->>A: Notify attacker (opponent must attempt)
        Socket-->>D: Notify defender (your turn to attempt)
    else Judgement is BAIL
        API->>DB: Attacker gets no points, next turn
        API->>Socket: Emit "judge_result" event
        Socket-->>A: Notify attacker (trick bailed)
    end

    API->>DB: COMMIT TRANSACTION
    API-->>Client: Judgement recorded

    Note over A,D: Defender Attempt Phase (if LAND)
    D->>Client: Record attempt video
    Client->>Storage: Upload video
    Storage-->>Client: Return video URL
    Client->>API: POST /api/games/:id/turns<br/>{video_url, is_response: true}
    API->>DB: INSERT INTO game_turns
    API->>Socket: Emit "new_turn" event
    Socket-->>A: Notify attacker (judge opponent's attempt)

    Note over A,D: Final Judgement
    A->>Client: Judge defender's attempt
    Client->>API: POST /api/games/turns/:id/judge<br/>{result: "BAIL"}
    API->>DB: BEGIN TRANSACTION
    API->>DB: UPDATE game_turns SET judgement
    API->>DB: UPDATE games SET defender_letters = 'S'
    API->>Socket: Emit "letter_awarded" event
    Socket-->>D: Notify defender (got letter S)
    Socket-->>A: Notify attacker (opponent got letter)
    API->>DB: COMMIT TRANSACTION
```

### Game State Machine

```mermaid
stateDiagram-v2
    [*] --> Created: Game challenged
    Created --> Active: Opponent accepts
    Created --> Declined: Opponent declines

    Active --> AttackerTurn: Attacker submits trick
    AttackerTurn --> DefenderJudge: Waiting for defender judgement

    DefenderJudge --> AttackerTurn: Judged as BAIL (next trick)
    DefenderJudge --> DefenderAttempt: Judged as LAND (must attempt)

    DefenderAttempt --> AttackerJudge: Defender submits attempt
    AttackerJudge --> DefenderTurn: Defender landed (no letter)
    AttackerJudge --> AttackerTurn: Defender bailed (letter awarded)

    DefenderTurn --> Active: Defender becomes attacker

    Active --> Completed: Player spells S.K.A.T.E.
    Active --> Forfeited: Player surrenders
    Active --> TimedOut: Deadline exceeded

    Declined --> [*]
    Completed --> [*]
    Forfeited --> [*]
    TimedOut --> [*]
```

### Concurrency Control

To prevent race conditions (e.g., double-voting), we use:

1. **Row-Level Locking** in PostgreSQL:
   ```sql
   SELECT * FROM games WHERE id = $1 FOR UPDATE;
   ```

2. **Idempotency Keys** via Socket.io event IDs:
   ```typescript
   const eventId = `${userId}-${gameId}-${turnId}-${timestamp}`;
   if (processedEvents.has(eventId)) return; // Duplicate
   ```

3. **Transaction Isolation**:
   - All game state mutations happen in database transactions
   - Rollback on any failure to maintain consistency

---

## Data Flow Diagrams

### Video Upload Flow

```mermaid
graph LR
    A[User Records Trick] --> B[Client: Compress Video]
    B --> C[Upload to Firebase Storage]
    C --> D[Generate Public URL]
    D --> E[Send URL to API]
    E --> F[Store in PostgreSQL]
    F --> G[Trigger Video Processing]
    G --> H[Generate Thumbnail]
    H --> I[Update DB with Thumbnail URL]
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant FB as Firebase Auth
    participant API as Express API
    participant DB as PostgreSQL

    U->>C: Enter email/password
    C->>FB: signInWithEmailAndPassword()
    FB-->>C: Firebase ID Token
    C->>API: Request with Authorization header
    API->>FB: verifyIdToken(token)
    FB-->>API: Decoded token (uid, email)
    API->>DB: SELECT * FROM users WHERE firebase_uid = $1
    DB-->>API: User record
    API->>API: Generate JWT session token
    API-->>C: Session token + user data
    C->>C: Store in localStorage
```

### Real-time Update Flow

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant API as API Server
    participant Socket as Socket.io Server
    participant P2 as Player 2

    P1->>API: Submit game turn
    API->>API: Update database
    API->>Socket: Emit "game_updated" event
    Socket->>Socket: Check connected clients
    Socket-->>P2: Push real-time update
    P2->>P2: Update UI immediately
```

---

## Technology Stack

### Frontend (Web)
```
React 18 (UI framework)
├── Vite 5.1.2 (Build tool)
├── TypeScript 5.9.3 (Type safety)
├── TailwindCSS (Styling)
├── Radix UI (Accessible components)
├── Zustand (State management)
├── TanStack React Query (Server state)
├── React Hook Form + Zod (Forms + validation)
├── Wouter (Routing)
├── React Leaflet (Maps)
└── Socket.io Client (Real-time)
```

### Frontend (Mobile)
```
React Native + Expo
├── Expo SDK 52
├── TypeScript 5.9.3
├── React Navigation (Routing)
├── Expo Camera (Video recording)
├── Expo Location (Geolocation)
├── Expo Notifications (Push alerts)
└── Socket.io Client (Real-time)
```

### Backend
```
Express.js (API server)
├── TypeScript 5.9.3
├── PostgreSQL + pg (Database)
├── Drizzle ORM (Type-safe queries)
├── Socket.io (Real-time events)
├── Firebase Admin SDK (Auth + Storage)
├── Stripe (Payments)
├── Resend (Email)
├── fluent-ffmpeg (Video processing)
├── Winston (Logging)
└── Sentry (Error tracking)
```

### DevOps
```
pnpm (Package manager)
├── Turborepo (Monorepo builds)
├── Vitest (Unit testing)
├── Cypress (E2E testing - web)
├── Playwright (Cross-browser testing)
├── Detox (E2E testing - mobile)
├── ESLint + Prettier (Code quality)
├── Husky (Git hooks)
├── Gitleaks (Secret scanning)
└── GitHub Actions (CI/CD)
```

---

## Database Schema

### Core Tables

```mermaid
erDiagram
    users ||--o{ games : "plays_in"
    users ||--o{ game_turns : "submits"
    users ||--o{ check_ins : "makes"
    users ||--o{ spots : "creates"

    games ||--|{ game_turns : "contains"
    spots ||--o{ check_ins : "receives"

    users {
        uuid id PK
        string firebase_uid UK
        string username UK
        string email
        string stance
        int xp
        int level
        string account_tier
        timestamp created_at
    }

    games {
        uuid id PK
        uuid challenger_id FK
        uuid opponent_id FK
        string status
        string challenger_letters
        string opponent_letters
        uuid current_turn_player FK
        uuid winner_id FK
        timestamp deadline
        timestamp created_at
    }

    game_turns {
        uuid id PK
        uuid game_id FK
        uuid player_id FK
        string video_url
        string trick_description
        string judgement
        uuid judge_id FK
        timestamp judged_at
        timestamp created_at
    }

    spots {
        uuid id PK
        string name
        float latitude
        float longitude
        string type
        string tier
        uuid creator_id FK
        jsonb metadata
        timestamp created_at
    }

    check_ins {
        uuid id PK
        uuid user_id FK
        uuid spot_id FK
        float latitude
        float longitude
        timestamp created_at
    }
```

### Key Indexes

```sql
-- Game lookups by player
CREATE INDEX idx_games_challenger ON games(challenger_id);
CREATE INDEX idx_games_opponent ON games(opponent_id);
CREATE INDEX idx_games_status ON games(status);

-- Geospatial queries for spots
CREATE INDEX idx_spots_location ON spots USING GIST (
    point(longitude, latitude)
);

-- Check-in uniqueness per day
CREATE UNIQUE INDEX idx_daily_checkin
ON check_ins(user_id, spot_id, DATE(created_at));

-- Turn lookups for games
CREATE INDEX idx_game_turns_game_id ON game_turns(game_id);
CREATE INDEX idx_game_turns_player ON game_turns(player_id);
```

---

## Security Architecture

### Multi-Layer Defense

```mermaid
graph TB
    subgraph "Client Layer"
        A[User Input] --> B[Zod Validation]
        B --> C[Firebase Auth Token]
    end

    subgraph "Network Layer"
        C --> D[HTTPS Only]
        D --> E[Rate Limiting]
    end

    subgraph "API Layer"
        E --> F[JWT Verification]
        F --> G[CSRF Token Check]
        G --> H[Role-Based Access Control]
    end

    subgraph "Database Layer"
        H --> I[Parameterized Queries]
        I --> J[Row-Level Security]
        J --> K[Audit Logging]
    end

    subgraph "Storage Layer"
        H --> L[Firebase Security Rules]
        L --> M[Signed URLs Only]
    end
```

### Security Features

1. **Authentication**
   - Firebase Auth for identity management
   - JWT session tokens with expiration
   - Email verification required for posting content
   - Password reset with secure tokens

2. **Authorization**
   - Role-based access control (user, admin, pro)
   - Resource ownership checks (can only edit own content)
   - Firebase rules for Firestore and Storage

3. **Input Validation**
   - Zod schemas on client and server
   - SQL injection prevention via parameterized queries (Drizzle)
   - XSS prevention via React auto-escaping and DOMPurify

4. **Rate Limiting**
   - Global: 100 requests per 15 minutes
   - Per-user: 20 requests per minute
   - Game-specific: 1 turn per 10 seconds

5. **Secret Management**
   - Environment variables for sensitive data
   - Multi-layer secret scanning (Gitleaks, Secretlint, CI hooks)
   - JWT secret generated at runtime and persisted
   - No secrets in code or git history

6. **Monitoring**
   - Sentry error tracking
   - Audit logs for admin actions
   - Failed login attempt tracking

---

## Deployment Architecture

### Production Environment

```mermaid
graph TB
    subgraph "Edge Layer"
        CDN[Vercel CDN]
        DNS[DNS / Route 53]
    end

    subgraph "Application Layer"
        Vercel[Vercel Serverless<br/>React App]
        API[Express API Server<br/>Cloud Run / Railway]
        Socket[Socket.io Server<br/>Persistent Connection]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Managed Instance)]
        FB[(Firebase<br/>Firestore + Storage)]
        RedisCloud[(Redis Cloud<br/>Sessions)]
    end

    subgraph "Services"
        Stripe[Stripe API]
        Resend[Resend Email]
        Sentry[Sentry Monitoring]
    end

    DNS --> CDN
    CDN --> Vercel
    Vercel --> API
    Vercel --> Socket

    API --> PG
    API --> FB
    API --> RedisCloud
    API --> Stripe
    API --> Resend

    Socket --> PG
    Socket --> RedisCloud

    API --> Sentry
    Socket --> Sentry
```

### Build Pipeline

```mermaid
graph LR
    A[Git Push] --> B[GitHub Actions]
    B --> C{Run Tests}
    C -->|Pass| D[TypeCheck]
    C -->|Fail| X[Abort]
    D --> E[Lint]
    E --> F[Build]
    F --> G{Secret Scan}
    G -->|Clean| H[Deploy to Vercel]
    G -->|Secrets Found| X
    H --> I[Health Check]
    I -->|Success| J[Complete]
    I -->|Fail| K[Rollback]
```

### Environment Separation

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| **Local** | localhost:3000 | Local PostgreSQL | Development |
| **Staging** | staging.skatehubba.com | Staging DB | QA Testing |
| **Production** | skatehubba.com | Production DB | Live Users |

---

## Performance Optimizations

### Caching Strategy

```mermaid
graph LR
    A[Client Request] --> B{Redis Cache?}
    B -->|Hit| C[Return Cached Data]
    B -->|Miss| D[Query Database]
    D --> E[Store in Redis]
    E --> C

    F[TTL Expiry] --> G[Invalidate Cache]
    H[Data Update] --> G
```

**Cached Resources:**
- Leaderboard (TTL: 60 seconds)
- User profiles (TTL: 5 minutes)
- Spot metadata (TTL: 1 hour)
- Game state (real-time, no cache)

### Database Optimizations

1. **Connection Pooling** - Reuse connections to reduce overhead
2. **Indexed Queries** - All foreign keys and frequently queried columns indexed
3. **Geospatial Indexes** - GiST indexes for location-based queries
4. **Materialized Views** - Precompute leaderboard rankings
5. **Query Optimization** - Use EXPLAIN ANALYZE to profile slow queries

### Video Delivery

1. **CDN Distribution** - Firebase Storage uses Google CDN
2. **Adaptive Streaming** - Serve different quality based on bandwidth (planned)
3. **Lazy Loading** - Load videos only when visible in viewport
4. **Thumbnail Previews** - Show thumbnails before full video loads

---

## Scalability Considerations

### Current Capacity
- **API Server:** Can handle ~1,000 concurrent users
- **Database:** PostgreSQL supports ~10,000 active games
- **Socket.io:** WebSocket server supports ~5,000 concurrent connections
- **Storage:** Firebase Storage scales automatically

### Scaling Plan

**Phase 1 (1k-10k users):**
- Vertical scaling (bigger server instances)
- Redis caching for hot data
- CDN for static assets

**Phase 2 (10k-100k users):**
- Horizontal scaling (multiple API servers behind load balancer)
- Read replicas for PostgreSQL
- Separate Socket.io cluster with sticky sessions

**Phase 3 (100k+ users):**
- Microservices architecture (separate game service, video service, etc.)
- Message queue (RabbitMQ/Kafka) for async processing
- Kubernetes for container orchestration
- Multi-region deployment for global users

---

## Related Documentation

- [Game Rules](GAME_RULES.md) - S.K.A.T.E. gameplay
- [Security](security/SECURITY.md) - Security policies
- [Deployment](DEPLOYMENT_RUNBOOK.md) - Production deployment
- [Database Migrations](../migrations/) - Schema evolution
- [API Specs](specs/) - Endpoint documentation

---

**Last Updated:** 2026-02-11
**Maintained By:** SkateHubba Engineering Team
