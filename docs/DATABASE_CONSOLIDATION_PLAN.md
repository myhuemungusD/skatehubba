# Database Consolidation Plan

> **Status:** Approved
> **Last updated:** 2026-02-24
> **Owner:** Engineering
> **Related:** [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md) · [DATA_BOUNDARIES.md](architecture/DATA_BOUNDARIES.md)

---

## Executive Summary

SkateHubba runs a hybrid PostgreSQL (Neon) + Firestore architecture. This is intentional — PostgreSQL owns structured/relational data, Firestore handles real-time subscriptions and ephemeral state. The architecture is sound.

However, rapid feature development created **two areas of genuine duplication** where the same domain (games, commerce) has parallel implementations across both stores with no sync layer between them. This document defines the consolidation target for every Firestore collection and the phased migration roadmap to get there.

**Target state:** PostgreSQL is the single source of truth for all persistent data. Firestore is a real-time projection layer and ephemeral-only store. No domain logic straddles both stores without an explicit sync path.

---

## Current State: Where the Duplication Lives

### Games — Two Systems, Two Stores

| System | Store | Tables/Collections | Status |
|--------|-------|--------------------|--------|
| **Turn-Based S.K.A.T.E.** (text-based, async) | PostgreSQL | `games`, `gameTurns`, `gameDisputes`, `challenges`, `gameSessions` | Active, Drizzle ORM |
| **Remote S.K.A.T.E.** (video-based, real-time) | Firestore | `games/{id}`, `games/{id}/rounds/{roundId}`, `videos/{id}` | Active, Cloud Functions + Express route |

The PostgreSQL `games` table and the Firestore `games` collection represent **different game modes** that evolved independently. The Firestore game system has no PostgreSQL backing store — game results, round history, and video metadata exist only in Firestore. This means:

- No SQL-queryable game history for Remote S.K.A.T.E.
- No cross-mode leaderboard integration
- No unified analytics across game types
- Firestore vendor lock-in for the flagship feature

### Commerce — Two Schemas, Two Stores

| System | Store | Tables/Collections | Status |
|--------|-------|--------------------|--------|
| **Simple shop** (catalog, basic orders) | PostgreSQL | `products`, `orders`, `donations`, `consumedPaymentIntents` | Active, Drizzle ORM |
| **Inventory-managed shop** (sharded stock, holds, Stripe integration) | Firestore | `products`, `holds`, `orders`, `processedEvents`, `products/{id}/stockShards/{id}` | Active, Cloud Functions |

The Firestore commerce system is the more sophisticated version (sharded counters for contention-free stock reservation, TTL-based holds, webhook deduplication). But it shares no data with the PostgreSQL `products`/`orders` tables. Neither store knows about the other.

---

## Consolidation Target: Collection-by-Collection

### Firestore Collections → Disposition

| Collection | Current Role | Target | Migration Phase |
|------------|-------------|--------|-----------------|
| **`users`** | Display projection (badges, XP, role) | **Keep as projection.** Read-only mirror of PostgreSQL `userProfiles`. Already correctly documented. | — (no change) |
| **`presence`** | Online/offline status | **Keep as authoritative.** Ephemeral real-time data. No value in PostgreSQL. | — (no change) |
| **`chatMessages`** | AI Skate Buddy conversations | **Keep as authoritative.** Ephemeral chat. No long-term analytics value. | — (no change) |
| **`activeCheckins`** | Currently checked-in users | **Keep as authoritative.** Ephemeral presence state. Historical check-ins already in PostgreSQL. | — (no change) |
| **`notifications`** | Server-generated alerts | **Keep as projection.** Server writes after PostgreSQL events. Already correctly architected. | — (no change) |
| **`leaderboardLive`** | Computed ranking for real-time display | **Keep as projection.** Computed from PostgreSQL, projected for client subscriptions. | — (no change) |
| **`challengeVotes`** | Real-time vote tallies | **Keep as projection.** Mirror of PostgreSQL `battleVotes` for live display. | — (no change) |
| **`challenges`** (Remote S.K.A.T.E.) | Challenge requests between players | **Migrate to PostgreSQL.** Persistent data with relational needs (join to user profiles, game history). Firestore becomes projection for real-time status updates. | Phase 1 |
| **`games`** (Remote S.K.A.T.E.) | Full game state, rounds, results | **Migrate to PostgreSQL.** Core business data that needs SQL analytics, cross-mode leaderboards, and long-term history. Firestore becomes real-time projection of active game state only. | Phase 2 |
| **`games/{id}/rounds`** | Round-by-round state | **Migrate to PostgreSQL** as `remoteSkateRounds` table. Firestore projection for active rounds only. | Phase 2 |
| **`videos`** | Video metadata (URLs, status, game/round links) | **Migrate to PostgreSQL** as `remoteSkateVideos` table. Video *files* stay in Firebase Storage. | Phase 2 |
| **`products`** (commerce) | Product catalog with sharded stock | **Consolidate into PostgreSQL.** Product catalog is relational. Stock management moves to PostgreSQL with `SELECT ... FOR UPDATE` or advisory locks (Neon supports both). | Phase 3 |
| **`holds`** | Inventory reservation with TTL | **Migrate to PostgreSQL.** Hold expiration via scheduled job (already have cron infrastructure in `server/routes/games-cron.ts`). | Phase 3 |
| **`orders`** (commerce) | Order records with Stripe metadata | **Consolidate with PostgreSQL `orders` table.** Merge schemas, single source of truth. | Phase 3 |
| **`processedEvents`** | Webhook deduplication | **Migrate to PostgreSQL.** Simple idempotency table. | Phase 3 |
| **`products/{id}/stockShards`** | Sharded stock counters | **Remove.** PostgreSQL `SELECT ... FOR UPDATE` on a `productStock` table eliminates need for application-level sharding. Neon handles this contention level (sub-1000 TPS checkout is not a hot-path). | Phase 3 |
| **`gameSessions`** (Firestore) | Legacy real-time game state | **Deprecate.** PostgreSQL `gameSessions` table already replaces this (schema comment confirms). Remove Firestore rules. | Phase 1 |
| **`signups`** | Beta email collection | **Deprecate.** Legacy pre-launch collection. Export data, drop collection. | Phase 1 |
| **`mail`**, **`mailList`**, **`subscriptions`** | Legacy email/subscription docs | **Deprecate.** Already server-only (`allow read, write: if false`). Remove rules. | Phase 1 |
| **`moderation_users`**, **`reports`**, **`mod_actions`**, **`moderation_quotas`** | Moderation data | **Migrate to PostgreSQL** `moderation` schema (if not already there). Server-only data with no real-time client need. | Phase 1 |

### Summary

| Disposition | Count | Collections |
|-------------|-------|-------------|
| **Keep (no change)** | 7 | `users`, `presence`, `chatMessages`, `activeCheckins`, `notifications`, `leaderboardLive`, `challengeVotes` |
| **Migrate to PostgreSQL** | 8 | `games` (remote), `rounds`, `videos`, `challenges` (remote), `products`, `holds`, `orders`, `processedEvents` |
| **Deprecate/Remove** | 6 | `gameSessions` (Firestore), `signups`, `mail`, `mailList`, `subscriptions`, `stockShards` |

---

## Migration Roadmap

### Phase 1: Cleanup and Quick Wins (Q1 2026)

**Goal:** Remove dead collections, eliminate confusion between legacy and active systems.

1. **Remove legacy Firestore rules** for `signups`, `mail`, `mailList`, `subscriptions`
   - Export any remaining data to a backup bucket
   - Delete rules from `firestore.rules`

2. **Remove Firestore `gameSessions` rules** — PostgreSQL `game_sessions` table is the replacement (already noted in schema comment)

3. **Migrate moderation collections** to PostgreSQL
   - `moderation_users` → PostgreSQL `moderation` schema
   - Already server-only (Firestore rules block all client access)
   - Straightforward data export + insert

4. **Migrate Remote S.K.A.T.E. `challenges`** to PostgreSQL
   - PostgreSQL already has a `challenges` table — extend it with fields for Remote S.K.A.T.E. (clip URLs, rules, participants)
   - Write-through: server writes to PostgreSQL, then projects to Firestore for real-time status
   - Client reads from Firestore for live updates (no change to UX)

**Deliverables:**
- [ ] Firestore rules trimmed from 536 lines → ~400 lines
- [ ] Zero orphaned collections
- [ ] `challenges` table unified across game modes

---

### Phase 2: Game System Unification (Q2 2026)

**Goal:** PostgreSQL becomes the source of truth for all S.K.A.T.E. game data across both modes. Firestore retains only the active-game projection for real-time subscriptions.

1. **Create PostgreSQL tables for Remote S.K.A.T.E.**
   ```sql
   -- Remote S.K.A.T.E. games (mirrors Firestore games collection)
   CREATE TABLE remote_skate_games (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     player_a_uid VARCHAR(255) NOT NULL,
     player_b_uid VARCHAR(255),
     status VARCHAR(20) NOT NULL DEFAULT 'waiting',
     letters JSONB NOT NULL DEFAULT '{}',
     current_turn_uid VARCHAR(255),
     created_by_uid VARCHAR(255) NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   );

   -- Round history
   CREATE TABLE remote_skate_rounds (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     game_id VARCHAR NOT NULL REFERENCES remote_skate_games(id),
     offense_uid VARCHAR(255) NOT NULL,
     defense_uid VARCHAR(255) NOT NULL,
     status VARCHAR(30) NOT NULL DEFAULT 'awaiting_set',
     result VARCHAR(10),
     offense_claim VARCHAR(10),
     defense_claim VARCHAR(10),
     set_video_id VARCHAR(255),
     reply_video_id VARCHAR(255),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Video metadata (files stay in Firebase Storage)
   CREATE TABLE remote_skate_videos (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     uid VARCHAR(255) NOT NULL,
     game_id VARCHAR NOT NULL REFERENCES remote_skate_games(id),
     round_id VARCHAR REFERENCES remote_skate_rounds(id),
     status VARCHAR(20) NOT NULL DEFAULT 'uploading',
     storage_path VARCHAR(500),
     duration_ms INTEGER,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Implement write-through in `server/routes/remoteSkate.ts`**
   - Every Firestore transaction in `resolve` and `confirm` endpoints gets a corresponding PostgreSQL write *first*
   - Pattern: `BEGIN → PostgreSQL write → COMMIT → Firestore projection update`
   - If Firestore projection fails, PostgreSQL still has the truth (eventually-consistent sync catches up)

3. **Migrate Cloud Functions to write-through**
   - `submitTrick`, `judgeTrick`, `processVoteTimeouts` in `functions/src/game/` gain PostgreSQL writes
   - Firestore remains the real-time layer; PostgreSQL becomes the system of record

4. **Backfill existing Firestore game data** into PostgreSQL
   - One-time migration script: read all `games` docs, insert into `remote_skate_games`
   - Read all `rounds` subcollections, insert into `remote_skate_rounds`
   - Verify row counts match document counts

5. **Unified leaderboard queries** across both game modes
   - Single SQL query can now join `games` + `remote_skate_games` for combined win/loss records
   - Leaderboard computation uses PostgreSQL, projects to `leaderboardLive` in Firestore

**Deliverables:**
- [ ] All Remote S.K.A.T.E. game results queryable in PostgreSQL
- [ ] Cross-mode leaderboard and analytics
- [ ] Firestore `games` collection becomes a projection (not source of truth)
- [ ] Historical data backfilled and verified

---

### Phase 3: Commerce Consolidation (Q3 2026)

**Goal:** Single commerce system in PostgreSQL. Cloud Functions move to Express API routes.

1. **Extend PostgreSQL `products` table**
   ```sql
   ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;
   ALTER TABLE products ADD COLUMN max_per_user INTEGER;
   ALTER TABLE products ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';
   ALTER TABLE products ADD COLUMN shards INTEGER; -- Legacy, remove after migration
   ```

2. **Create `product_holds` table**
   ```sql
   CREATE TABLE product_holds (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id VARCHAR(255) NOT NULL,
     product_id INTEGER NOT NULL REFERENCES products(id),
     qty INTEGER NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'held',
     expires_at TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_holds_expiry ON product_holds (status, expires_at)
     WHERE status = 'held';
   ```

3. **Replace sharded Firestore counters with PostgreSQL stock management**
   - `SELECT stock FROM products WHERE id = $1 FOR UPDATE` handles contention
   - For SkateHubba's scale (<1000 concurrent checkouts), row-level locks are more than sufficient
   - Eliminates the complexity of sharded counters entirely

4. **Migrate `holdAndCreatePaymentIntent` from Cloud Function to Express route**
   - Move to `server/routes/commerce.ts`
   - Same Stripe integration, PostgreSQL replaces Firestore transactions
   - Hold expiration via existing cron infrastructure

5. **Extend PostgreSQL `orders` table** to include shipping, tax, and Stripe fields from Firestore schema
   ```sql
   ALTER TABLE orders ADD COLUMN shipping_address JSONB;
   ALTER TABLE orders ADD COLUMN subtotal_cents INTEGER;
   ALTER TABLE orders ADD COLUMN tax_cents INTEGER;
   ALTER TABLE orders ADD COLUMN shipping_cents INTEGER;
   ALTER TABLE orders ADD COLUMN stripe_payment_intent_id VARCHAR(255);
   ALTER TABLE orders ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';
   ALTER TABLE orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
   ```

6. **Create `processed_webhook_events` table** for Stripe idempotency
   ```sql
   CREATE TABLE processed_webhook_events (
     event_id VARCHAR(255) PRIMARY KEY,
     processed_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

7. **Decommission Firestore commerce collections**
   - Remove `products`, `holds`, `orders`, `processedEvents`, `stockShards` rules
   - Remove Cloud Functions commerce code
   - Single Express-based commerce API

**Deliverables:**
- [ ] Zero Firestore commerce collections
- [ ] All orders, products, holds in PostgreSQL
- [ ] Cloud Functions reduced to auth/RBAC concerns only
- [ ] Simpler operational model (one data store for commerce)

---

## What Stays in Firestore (Permanently)

These collections have legitimate real-time or ephemeral characteristics that Firestore handles well and PostgreSQL doesn't need to own:

| Collection | Reason |
|------------|--------|
| `presence` | Inherently ephemeral — no historical value, needs real-time push |
| `chatMessages` | AI chat history — ephemeral, no analytics need, real-time display |
| `activeCheckins` | Temporary state — expires on checkout, real-time map overlay |
| `users` | **Projection only** — read-optimized subset of PostgreSQL `userProfiles` for client subscriptions |
| `notifications` | **Projection only** — server-generated, real-time delivery to client |
| `leaderboardLive` | **Projection only** — computed from PostgreSQL, pushed for real-time display |
| `challengeVotes` | **Projection only** — mirrors PostgreSQL votes for live tallies |
| Active game state | **Projection only** — Firestore retains the real-time view of active games (after Phase 2, not the source of truth) |

### Firebase Services That Remain

| Service | Role | Consolidation Impact |
|---------|------|---------------------|
| **Firebase Auth** | Identity provider | No change. Handles OAuth, MFA, phone auth. |
| **Firebase Storage** | Video/image blob store | No change. PostgreSQL stores metadata; Storage stores files. |
| **FCM** | Push notifications | No change. |
| **Cloud Functions** | After Phase 3, reduced to: auth triggers (custom claims), App Check enforcement | Commerce and game logic moves to Express. |

---

## Risk Mitigation

### Data Consistency During Migration

Each phase uses a **write-through transition period**:

1. **Dual-write**: New code writes to PostgreSQL first, then syncs to Firestore
2. **Verify**: Automated comparison job ensures row counts and key fields match
3. **Cutover**: Once verified, remove Firestore writes for that domain
4. **Cleanup**: Drop Firestore rules and collections

### Rollback Strategy

- Each phase has its own feature flag (`FEATURE_PG_REMOTE_SKATE`, `FEATURE_PG_COMMERCE`)
- If PostgreSQL writes fail, the system falls back to Firestore-only (degraded but functional)
- Feature flags are removed only after 2-week bake period with zero fallbacks triggered

### Performance Considerations

- **Game real-time latency**: Firestore projections remain for active games — clients still get sub-100ms updates via `onSnapshot`. PostgreSQL write adds ~10ms to the server-side path (negligible for async gameplay).
- **Commerce stock contention**: PostgreSQL `FOR UPDATE` locks are adequate for <1000 concurrent checkouts. If SkateHubba reaches 10k+ concurrent checkouts, evaluate pgBouncer connection pooling or optimistic locking.

---

## Cost Impact

| Phase | Firestore Cost Change | PostgreSQL Cost Change | Net |
|-------|----------------------|----------------------|-----|
| Phase 1 (cleanup) | -$5/mo (fewer stored docs) | $0 | -$5/mo |
| Phase 2 (games) | -$15-30/mo (fewer writes, reads shift to projection-only) | +$5/mo (more rows) | -$10-25/mo |
| Phase 3 (commerce) | -$20-40/mo (remove commerce collections + Cloud Functions invocations) | +$5/mo | -$15-35/mo |
| **Total** | **-$40-75/mo** | **+$10/mo** | **-$30-65/mo** |

Cloud Functions invocation costs also decrease as game and commerce logic moves to the Express server (already running, no per-invocation charge).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-24 | Hybrid architecture is intentional, not accidental | PostgreSQL for relational data, Firestore for real-time. Each store plays to its strengths. |
| 2026-02-24 | Consolidate Remote S.K.A.T.E. to PostgreSQL | Game results are core business data. Must be SQL-queryable for analytics, leaderboards, and cross-mode stats. |
| 2026-02-24 | Consolidate commerce to PostgreSQL | ACID transactions with `FOR UPDATE` are simpler and more correct than Firestore sharded counters at our scale. |
| 2026-02-24 | Keep presence, chat, active checkins in Firestore | Ephemeral data with real-time requirements. No analytical or relational value. |
| 2026-02-24 | Firestore remains as projection layer post-consolidation | Client real-time UX depends on `onSnapshot`. We're not replacing Firestore — we're removing it as a source of truth for persistent data. |

---

## Success Criteria

After all three phases:

- [ ] Every persistent record has exactly one authoritative store (PostgreSQL)
- [ ] Firestore contains only projections and ephemeral data
- [ ] A single SQL query can answer "show me all games, wins, and revenue for user X"
- [ ] Cloud Functions handle only auth triggers and App Check — no business logic
- [ ] Firestore rules file is under 300 lines
- [ ] Zero dual-source ambiguity in any domain

---

## The Investor Narrative

> SkateHubba uses a hybrid PostgreSQL + Firebase architecture by design. PostgreSQL is the transactional backbone — user identity, game history, commerce, analytics. Firebase provides authentication (OAuth, MFA), real-time subscriptions for live gameplay, and blob storage for trick videos.
>
> During rapid prototyping, our Remote S.K.A.T.E. game mode and commerce system were built Firebase-first for speed. We've since defined a three-phase consolidation plan to migrate all persistent business data to PostgreSQL while keeping Firebase strictly for auth, real-time projections, and media storage.
>
> Phase 1 (cleanup) ships in Q1. Phase 2 (game unification) ships in Q2 — timed with tournament mode, which requires cross-mode leaderboards that only PostgreSQL can efficiently serve. Phase 3 (commerce consolidation) ships in Q3, aligning with premium tier launch.
>
> Post-consolidation, our Firestore spend drops by ~50%, we eliminate Cloud Functions as a business logic runtime, and every question about users, games, or revenue is answerable with a single SQL query.
