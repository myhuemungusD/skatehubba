# S.K.A.T.E. Feature — Production Health Audit

**Date:** 2026-03-01
**Scope:** Full codebase audit of the SKATE game feature across client, server, mobile, packages, Firestore, and PostgreSQL layers
**Overall Health Score: 5.5/10 — Functional but structurally fragmented**

---

## Executive Summary

The SKATE feature actually contains **three separate, incompatible game systems** that share no types, no constants, and no validation layer between them. While each system works internally, the divergence creates maintenance risk, naming confusion, and real production bugs waiting to happen.

| System | Data Store | Location | Status |
|--------|-----------|----------|--------|
| **Async Turn-Based** | PostgreSQL | `server/routes/games-*.ts` + `client/src/pages/skate-game.tsx` | Active |
| **Real-Time Session** | Firestore | `packages/types/game.ts` + `mobile/` + `functions/` | Active (mobile) |
| **Remote SKATE** | Firestore | `server/routes/remoteSkate.ts` + `client/src/pages/remote-skate.tsx` | Active |

---

## CRITICAL Issues (P0)

### 1. Game Status Enum — 4 Different Definitions

Every system uses different status values for the same concept:

| System | File | Statuses |
|--------|------|----------|
| **PostgreSQL** | `packages/shared/schema/games.ts:7` | `pending`, `active`, `completed`, `declined`, `forfeited` |
| **Real-Time** | `packages/types/game.ts:8` | `waiting`, `active`, `completed`, `abandoned`, `paused` |
| **Remote SKATE** | `client/src/lib/remoteSkate/remoteSkateService.ts:37` | `waiting`, `active`, `complete`, `cancelled` |
| **Mobile Zod** | `mobile/src/hooks/useGameSession.ts:63` | `waiting`, `active`, `completed`, `abandoned` |

Key conflicts:
- `"pending"` vs `"waiting"` — same meaning, different string
- `"completed"` vs `"complete"` — typo-level mismatch in Remote SKATE
- `"forfeited"` exists only in PostgreSQL; `"cancelled"` only in Remote; `"abandoned"` / `"paused"` only in Real-Time
- No conversion layer bridges these

### 2. Turn Phase — Two Completely Different Systems

| System | File | Phases |
|--------|------|--------|
| **PostgreSQL / Client API** | `packages/shared/schema/games.ts:14` | `set_trick`, `respond_trick`, `judge` (3 phases) |
| **Real-Time / Mobile** | `packages/types/game.ts:11-15` | `attacker_recording`, `defender_recording`, `judging`, `round_complete` (4 phases) |

Zero overlap. The same `TurnPhase` type name is exported from two different packages with completely incompatible values.

### 3. `gameSessions` Export — References Undefined Symbol

`packages/db/index.ts:76` exports `gameSessions` from `@shared/schema/games`, but **no such export exists** in `packages/shared/schema/games.ts`. This will cause a TypeScript compilation error if anyone imports it.

- Migration `0005_consolidate_to_postgresql.sql` creates a `game_sessions` table, but no corresponding Drizzle schema definition was ever written.

### 4. `challenges` Table — Schema Without Migration

`packages/shared/schema/games.ts:85-95` defines a `challenges` pgTable, but **no SQL migration creates this table**. Any runtime query against this table will fail with a "relation does not exist" error.

---

## HIGH Issues (P1)

### 5. SKATE Letters — 4 Redundant Definitions, 3 Different Formats

| Location | Format | Value |
|----------|--------|-------|
| `packages/types/game.ts:5` | `SkateLetter[]` array | `["S", "K", "A", "T", "E"]` |
| `functions/src/game/constants.ts:7` | `readonly tuple` | `["S", "K", "A", "T", "E"] as const` |
| `server/routes/games-shared.ts:16` | `string` | `"SKATE"` |
| `server/routes/remoteSkate.ts:29` | `string` (duplicate) | `"SKATE"` |

`remoteSkate.ts` locally redefines `SKATE_LETTERS` instead of importing from `games-shared.ts` 3 lines away. Three different runtime representations of the same constant.

### 6. Move Result — "bailed" vs "missed" Mismatch

| System | File | Values |
|--------|------|--------|
| **Real-Time** | `packages/types/game.ts:32` | `landed`, **`bailed`**, `missed`, `pending` |
| **PostgreSQL** | `packages/shared/schema/games.ts:18` | `landed`, `missed`, `pending` |
| **Client API** | `client/src/lib/api/game/types.ts:44` | `pending`, `landed`, `missed` |

The mobile/real-time system uses `"bailed"` to indicate a failed trick. The PostgreSQL system uses `"missed"` for the same concept. The judgment votes in `JudgmentVotes` only allow `"landed" | "bailed"`, creating a terminology split across the stack.

### 7. Player Naming — Three Different Conventions

| System | Fields |
|--------|--------|
| **PostgreSQL** | `player1Id`, `player1Name`, `player2Id`, `player2Name` |
| **Real-Time** | `player1Id`, `player1DisplayName`, `player2Id`, `player2DisplayName`, `player1PhotoURL`, `player2PhotoURL` |
| **Remote SKATE** | `playerAUid`, `playerBUid` (no names stored) |

### 8. Letter Tracking — Three Different Representations

| System | File | Type |
|--------|------|------|
| **PostgreSQL** | `packages/shared/schema/games.ts:36-37` | `varchar(5)` string (e.g., `"SKA"`) |
| **Real-Time** | `packages/types/game.ts:61-62` | `SkateLetter[]` array (e.g., `["S","K","A"]`) |
| **Remote SKATE** | `client/src/lib/remoteSkate/remoteSkateService.ts:53` | `Record<string, string>` map (e.g., `{uid: "SKA"}`) |

### 9. Dead Code — Files Never Imported

| File | Lines | Issue |
|------|-------|-------|
| `client/src/components/PlaySkateGame.tsx` | 162 | Socket.io-based game component, **never imported anywhere**. Legacy from earlier iteration. |
| `client/src/hooks/useSkateGame.ts` | 140 | React Query game hook, **never imported anywhere**. Superseded by `useSkateGameApi.ts`. |

### 10. JudgmentVotes — Defined in 5 Separate Places

| Location | Type |
|----------|------|
| `packages/types/game.ts:18-21` | TypeScript interface |
| `functions/src/game/judgeTrick.ts:34-37` | Local duplicate interface |
| `mobile/src/hooks/useGameSession.ts:32-35` | Zod schema |
| `mobile/src/hooks/useGameSession.test.ts:61-64` | Duplicate Zod schema in test |
| `infra/firebase/functions/judgeTrick.test.ts:30` | Duplicate interface in test |

---

## MEDIUM Issues (P2)

### 11. Duplicate UI Components — LettersDisplay vs LetterDisplay

| Component | File | Props |
|-----------|------|-------|
| `LettersDisplay` | `client/src/components/game/LettersDisplay.tsx` (164 lines) | `{ letters, playerName, isCurrentPlayer, className }` |
| `LetterDisplay` | `client/src/components/remoteSkate/LetterDisplay.tsx` (52 lines) | `{ letters, label, isCurrentUser, className }` |

Same concept, different prop names (`playerName` vs `label`, `isCurrentPlayer` vs `isCurrentUser`), different implementations. The async version has escalating color logic and status labels; the remote version is a simpler render.

### 12. Duplicate Game Over Components

| Component | File | Used By |
|-----------|------|---------|
| `GameOverScreen` | `client/src/components/game/GameOverScreen.tsx` (80 lines) | `skate-game.tsx` |
| `GameComplete` | `client/src/components/remoteSkate/GameComplete.tsx` (88 lines) | `GameRound.tsx` |

Both render end-of-game states with different data shapes and different CTAs ("Run it back?" vs "Play Again").

### 13. JudgePanel vs JudgePhase — Possible Duplicate

| Component | File | Purpose |
|-----------|------|---------|
| `JudgePanel` | `client/src/components/game/JudgePanel.tsx` (56 lines) | Uses "LAND" / "BAIL" buttons |
| `JudgePhase` | `client/src/components/game/JudgePhase.tsx` (58 lines) | Uses "I LANDED IT" / "I MISSED" buttons |

Needs verification whether both are used or if `JudgePanel` is dead code.

### 14. `isGameOver()` Logic — Reimplemented 3 Times

| Location | Implementation |
|----------|---------------|
| `server/routes/games-shared.ts:64-71` | Compares letter string lengths against `SKATE_LETTERS_TO_LOSE` constant |
| `functions/src/game/judgeTrick.ts:197-201` | Inline `if (newLetters.length === 5)` with magic number |
| `mobile/src/hooks/useRemoteSkateGame.ts` | Checks `game.status === "complete"` (status-based, not letter-based) |

### 15. Hardcoded Domain in SocialShare

`client/src/components/game/SocialShare.tsx`:
```typescript
const shareUrl = `https://skatehubba.com/play?game=${gameId}`;
```
Should be `${window.location.origin}/play?game=${gameId}` — will break in staging/preview environments.

### 16. Constants Scattered Across 5+ Files

| Constant | Location | Value |
|----------|----------|-------|
| `TURN_DEADLINE_MS` | `server/routes/games-shared.ts:13` | 24 hours |
| `GAME_HARD_CAP_MS` | `server/routes/games-shared.ts:14` | 7 days |
| `MAX_VIDEO_DURATION_MS` | `server/routes/games-shared.ts:15` | 15 seconds |
| `VOTE_TIMEOUT_MS` | `functions/src/game/constants.ts:10` | 60 seconds |
| `VOTE_REMINDER_BEFORE_MS` | `functions/src/game/constants.ts:13` | 30 seconds |
| `SKATE_LETTERS_TO_LOSE` | `server/config/constants.ts:58` | 5 |

No shared constants package. Server constants are unreachable from client/mobile/functions.

### 17. `packages/utils` Is Empty

`packages/utils/index.ts` exports `{}`. This package exists in the workspace but contains zero utility functions. Shared logic is copy-pasted instead.

### 18. Remote SKATE `reply-complete` Doesn't Update Round Status

`server/routes/remoteSkate.ts:457-531` — The `reply-complete` endpoint updates `game.currentTurnUid` but does **not** update `round.status`. The round remains in `"awaiting_reply"` status after the reply video is uploaded. The `resolve` endpoint then checks `round.status !== "awaiting_reply"` to determine if it's resolvable — this works but only because the status was never transitioned. The flow is fragile: if any other code path changes the round status, the resolve check breaks.

---

### 19. API Error Handling — Two Different Response Formats

`games-challenges.ts` uses the standardized `Errors` utility:
```typescript
return Errors.validation(res, parsed.error.flatten());
return Errors.badRequest(res, "SELF_CHALLENGE", "Cannot challenge yourself.");
```

But `games-turns.ts`, `games-disputes.ts`, and `games-management.ts` use raw responses:
```typescript
return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
return res.status(404).json({ error: "Game not found" });
```

The client receives inconsistent error shapes depending on which endpoint failed.

### 20. API Documentation Out of Date

`server/api-docs/endpoints/game.ts` documents routes that don't exist:
- `GET /api/games` — not a real endpoint
- `POST /api/games/:gameId/join` — not a real endpoint
- `POST /api/games/:gameId/trick` — should be `/api/games/:id/turns`

Meanwhile actually-existing routes like `/api/games/:id/forfeit`, `/api/games/my-games`, `/api/games/stats/me`, `/api/games/:id/dispute` are undocumented.

### 21. Firebase Cloud Functions — Possible Duplicate of Express Routes

`functions/src/game/` exports `submitTrick`, `judgeTrick`, `setterBail` which appear to implement the same logic as `server/routes/games-turns.ts`. If both pathways are live, they could create race conditions on the same game state. Needs clarification on which is the active production path.

---

## LOW Issues (P3)

### 22. Unused Props Passed to GameStatusHeader

`client/src/pages/skate-game.tsx` passes `myLetters` and `oppLetters` to `<GameStatusHeader>`, but the component doesn't use them.

### 23. Validation Schema for `resolveDisputeSchema` Uses `disputeId`

`server/routes/games-shared.ts:52-55` defines:
```typescript
export const resolveDisputeSchema = z.object({
  disputeId: z.number().int().positive(),
  finalResult: z.enum(["landed", "missed"]),
});
```
But the client type `ResolveDisputeRequest` at `client/src/lib/api/game/types.ts:134-136` only sends `finalResult`, not `disputeId`. The dispute ID comes from the route parameter, so the schema's `disputeId` field may never be validated from the body.

### 24. `currentTurn` Naming Ambiguity

The async game uses `game.currentTurn` (a player ID string), while the remote game uses `game.currentTurnUid`. In the PostgreSQL schema, `currentTurn` reads like it could be a turn number. Should be `currentPlayerId` for clarity.

### 25. Duplicate Zod Validation Schemas in remoteSkate.ts

`server/routes/remoteSkate.ts:104-110` defines `resolveSchema` and `confirmSchema` with identical bodies:
```typescript
const resolveSchema = z.object({ result: z.enum(["landed", "missed"]) });
const confirmSchema = z.object({ result: z.enum(["landed", "missed"]) });
```
These are the same schema duplicated under different names.

### 26. In-Memory Dedup Map Won't Scale

`server/routes/games-shared.ts:22` uses an in-memory `Map` for deadline warning dedup. This won't persist across server restarts or work with horizontal scaling. Documented as a known limitation but worth flagging.

---

## Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │           THREE GAME SYSTEMS            │
                    └─────────────────────────────────────────┘

  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
  │   ASYNC TURN-BASED   │  │   REAL-TIME SESSION   │  │    REMOTE SKATE      │
  │   (PostgreSQL)       │  │   (Firestore)         │  │    (Firestore)       │
  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
  │ Schema:              │  │ Types:                │  │ Types:               │
  │  shared/schema/      │  │  packages/types/      │  │  remoteSkateService  │
  │  games.ts            │  │  game.ts              │  │  .ts (local)         │
  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
  │ Server:              │  │ Server:               │  │ Server:              │
  │  routes/games-*.ts   │  │  functions/src/game/* │  │  routes/remoteSkate  │
  │  services/game*.ts   │  │                       │  │  .ts                 │
  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
  │ Client:              │  │ Client:               │  │ Client:              │
  │  pages/skate-game    │  │  (mobile only)        │  │  pages/remote-skate  │
  │  hooks/useSkate      │  │  hooks/useGame        │  │  hooks/useRemote     │
  │  GameApi.ts          │  │  Session.ts           │  │  SkateGame.ts        │
  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
  │ Status:              │  │ Status:               │  │ Status:              │
  │  pending, active,    │  │  waiting, active,     │  │  waiting, active,    │
  │  completed, declined │  │  completed, abandoned │  │  complete, cancelled │
  │  forfeited           │  │  paused               │  │                      │
  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
  │ Phases:              │  │ Phases:               │  │ Phases:              │
  │  set_trick           │  │  attacker_recording   │  │  awaiting_set        │
  │  respond_trick       │  │  defender_recording   │  │  awaiting_reply      │
  │  judge               │  │  judging              │  │  awaiting_confirmation│
  │                      │  │  round_complete       │  │  disputed, resolved  │
  ├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤
  │ Letters:             │  │ Letters:              │  │ Letters:             │
  │  varchar string      │  │  SkateLetter[] array  │  │  Record<uid,string>  │
  │  "SKA"               │  │  ["S","K","A"]        │  │  {uid: "SKA"}        │
  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘

        NO TYPE BRIDGES           NO SHARED CONSTANTS          NO CONVERSION LAYER
```

---

## Dead Code Inventory

| File | Lines | Type | Evidence |
|------|-------|------|----------|
| `client/src/components/PlaySkateGame.tsx` | 162 | Component | Zero imports across codebase |
| `client/src/hooks/useSkateGame.ts` | 140 | Hook | Zero imports; superseded by `useSkateGameApi.ts` |
| `packages/utils/index.ts` | 3 | Package | Exports empty object `{}` |
| `packages/db/index.ts` → `gameSessions` export | — | Export | References symbol that doesn't exist |

---

## File-Level Issue Map

| File | Line(s) | Issue | Severity |
|------|---------|-------|----------|
| `packages/shared/schema/games.ts` | 7 | Game status missing `waiting`, `cancelled` | P0 |
| `packages/types/game.ts` | 8 | Game status missing `pending`, `declined`, `forfeited` | P0 |
| `client/src/lib/remoteSkate/remoteSkateService.ts` | 37 | Uses `"complete"` not `"completed"` | P0 |
| `packages/db/index.ts` | 76 | Exports undefined `gameSessions` | P0 |
| `packages/shared/schema/games.ts` | 85-95 | `challenges` table has no migration | P0 |
| `packages/types/game.ts` | 11-15 | TurnPhase completely different from server | P0 |
| `packages/types/game.ts` | 32 | `MoveResult` includes "bailed", server doesn't | P1 |
| `server/routes/remoteSkate.ts` | 29 | Duplicates `SKATE_LETTERS` locally | P1 |
| `client/src/components/PlaySkateGame.tsx` | 1-162 | Dead code, never imported | P1 |
| `client/src/hooks/useSkateGame.ts` | 1-140 | Dead code, never imported | P1 |
| `client/src/components/game/SocialShare.tsx` | — | Hardcoded `skatehubba.com` domain | P2 |
| `server/routes/remoteSkate.ts` | 104-110 | Duplicate identical Zod schemas | P3 |
| `server/routes/games-shared.ts` | 52-55 | `disputeId` in body schema may be unused | P3 |

---

## Recommendations (Priority Order)

### Immediate (P0 — blocks correctness)
1. **Define `gameSessions` Drizzle schema** matching migration 0005, or remove the dangling export from `packages/db/index.ts`
2. **Create migration for `challenges` table**, or remove the schema definition if it's unused
3. **Unify game status enums** — pick one canonical set and create a shared constant in `packages/shared`

### Short-term (P1 — reduces risk)
4. **Delete dead code**: `PlaySkateGame.tsx` and `useSkateGame.ts`
5. **Create `packages/game-constants`** with `SKATE_LETTERS`, `SKATE_LETTERS_TO_LOSE`, `isGameOver()`, and all timeout constants
6. **Standardize "bailed" vs "missed"** — choose one term and use it everywhere
7. **Add type bridges** between systems with explicit converter functions

### Medium-term (P2 — reduces maintenance burden)
8. **Unify `LettersDisplay` components** into a single reusable component
9. **Unify `GameOverScreen` / `GameComplete`** with a shared base
10. **Fix hardcoded domain** in SocialShare.tsx
11. **Consolidate `JudgmentVotes`** into a single export from `@skatehubba/types`
12. **Verify `JudgePanel` vs `JudgePhase`** — delete one if duplicate

### Long-term (architecture)
13. **Document the three-system architecture** — if intentional, each system needs clear ownership boundaries
14. **Evaluate consolidation** — can Real-Time and Remote SKATE merge into one Firestore-based system?
15. **Populate `packages/utils`** with shared logic currently duplicated across layers
16. **Standardize API error responses** — migrate all game routes to use the `Errors` utility
17. **Update API documentation** in `server/api-docs/endpoints/game.ts` to match actual routes

---

## What's Working Well

| Area | Details |
|------|---------|
| **Transaction safety** | All PostgreSQL write operations use `FOR UPDATE` row locks. Firestore operations use `runTransaction`. No race conditions in the happy path. |
| **Auth coverage** | 100% of game routes require `authenticateUser`. Dispute resolution requires `requireAdmin`. Remote SKATE uses `verifyFirebaseAuth`. No unauthenticated endpoints. |
| **Rate limiting** | Both async game routes (`gameWriteLimiter`) and remote SKATE routes (`remoteSkateLimiter`) are rate-limited. |
| **Route ordering** | Specific routes (`/my-games`, `/stats/me`) are correctly defined before generic `/:id` to avoid shadowing. |
| **Client-server parity** | All 11 client API methods in `useSkateGameApi.ts` have matching server routes. No orphaned client calls. |
| **Notification layer** | `gameNotificationService` is consistently called after game state changes (challenge, acceptance, turn completion, forfeit). |
| **Cron jobs** | `forfeitExpiredGames`, `notifyDeadlineWarnings`, `forfeitStalledGames` are properly exported and registered behind `verifyCronSecret`. |
| **Service extraction** | `gameTurnService.ts` and `gameDisputeService.ts` properly separate business logic from route handlers. |
| **Firestore rules** | Game collections are properly secured: only participants can read, mutations go through server API. |
