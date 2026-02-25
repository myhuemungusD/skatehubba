# S.K.A.T.E. Game Feature — Full Audit Report

**Date:** 2026-02-25
**Scope:** Complete S.K.A.T.E. game feature across web client, mobile app, server API, WebSocket real-time layer, database schema, and shared packages.
**Files Reviewed:** 60+ files across `client/`, `mobile/`, `server/`, `packages/`, `migrations/`, and test suites.

---

## Executive Summary

The S.K.A.T.E. game feature is implemented across **two distinct architectures**:

1. **Async turn-based (Web)** — REST API + PostgreSQL, 24-hour turn deadlines, video upload via Firebase Storage
2. **Real-time multiplayer (Mobile/Web)** — WebSocket (Socket.IO) + PostgreSQL `game_sessions` table, 60-second turn timeouts, Firestore real-time listeners on mobile

Both systems are production-grade with strong foundations: row-level locking (`SELECT FOR UPDATE`), Zod input validation, idempotency keys, transactional state updates, and rate limiting. However, this audit uncovered **7 critical/high findings**, **9 medium findings**, and **6 low/informational items** that should be addressed.

### Finding Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | Action required |
| High | 5 | Action required |
| Medium | 9 | Should fix |
| Low | 6 | Informational |

---

## Architecture Overview

### Dual Game Systems

The codebase contains **two separate game implementations** that appear to target different use cases:

| Aspect | Async (REST API) | Real-time (WebSocket) |
|--------|------------------|-----------------------|
| Tables | `games`, `game_turns`, `game_disputes` | `game_sessions` |
| Client | `client/src/pages/skate-game.tsx` | Mobile via `useGameSession.ts` + Socket handlers |
| Server | `server/routes/games*.ts` + `server/services/gameTurnService.ts` | `server/socket/handlers/game/` + `server/services/game/` |
| Turn duration | 24 hours | 60 seconds |
| Players | 2 (1v1) | 2-8 (multiplayer) |
| Types | `packages/types/game.ts` (Firestore types) | `server/services/game/types.ts` (PostgreSQL types) |
| Video | Firebase Storage upload, auto-send | Optional clip URL |
| Judging | Defensive player judges LAND/BAIL | Self-report (pass = letter) |
| Disputes | 1 per player per game, admin-resolved | None |

### Shared Schema

Both systems share the `packages/shared/schema/games.ts` Drizzle schema but operate on different tables. The `games`/`game_turns`/`game_disputes` tables power async mode; the `game_sessions` table powers real-time mode.

---

## Critical Findings

### C1: Type Mismatch Between `packages/types/game.ts` and Actual Database Schema

**Location:** `packages/types/game.ts`, `packages/shared/schema/games.ts`
**Severity:** Critical
**Impact:** Data integrity, runtime errors

The `packages/types/game.ts` file defines a `GameSession` interface with Firestore-style fields (`currentAttacker`, `turnPhase: "attacker_recording" | "defender_recording" | "judging" | "round_complete"`, `moves: Move[]`, `voteDeadline`, etc.) that **do not match** the PostgreSQL schema in `packages/shared/schema/games.ts`.

The database schema uses:
- `turnPhase: "set_trick" | "respond_trick" | "judge"` (different enum values)
- `offensivePlayerId` / `defensivePlayerId` (vs `currentAttacker`)
- `player1Letters: varchar(5)` as a string (vs `SkateLetter[]` array)
- No `moves` array, `voteDeadline`, `voteReminderSent`, or `voteTimeoutOccurred` columns

The mobile app (`useGameSession.ts:56-63`) validates against the Firestore-based types (`attacker_recording`, `defender_recording`, `judging`, `round_complete`) which don't align with the PostgreSQL-backed REST API's phase names.

**Risk:** If mobile ever connects to the REST API instead of Firestore, all game state parsing will fail. This also makes cross-platform feature development error-prone.

**Recommendation:** Unify type definitions. Either:
- Create a single source of truth for game types that both backends map to, or
- Deprecate the Firestore types if the migration to PostgreSQL is complete

### C2: Dispute Resolution Allows Wrong Player to Remove Wrong Player's Letter

**Location:** `server/services/gameDisputeService.ts:160-168`
**Severity:** Critical
**Impact:** Game integrity manipulation

When a dispute is resolved as `"landed"` (overturning a BAIL), the code attempts to remove a letter from the defender:

```typescript
const defenderIsPlayer1 = game.player1Id === dispute.againstPlayerId;
const currentLetters = defenderIsPlayer1
  ? game.player1Letters || ""
  : game.player2Letters || "";
```

The variable name `defenderIsPlayer1` is misleading. `dispute.againstPlayerId` is the player who **judged** BAIL, not necessarily the defender. In the game flow, the defensive player does the judging, so `againstPlayerId` is the defensive player. But the code then removes a letter from the **defensive player's** letters — when it should be removing the letter that was **given to the offensive/disputing player** when they were BAILed.

Looking at the flow:
1. Offensive player sets a trick
2. Defensive player watches and records response
3. Defensive player judges BAIL → offensive player gets a letter
4. Offensive player disputes → if overturned to LAND, the offensive player's letter should be removed

But the code removes the letter from `dispute.againstPlayerId` (the defensive/judging player), who **didn't receive a letter in the first place**. The letter was given to `dispute.disputedBy` (the offensive player).

**Recommendation:** The letter removal should target `dispute.disputedBy` (the player who got the letter), not `dispute.againstPlayerId`.

---

## High Findings

### H1: No Rate Limiting on Challenge Creation (REST API)

**Location:** `server/routes/games-challenges.ts:27`
**Severity:** High
**Impact:** Spam, abuse, notification bombing

The `POST /api/games/create` endpoint has `authenticateUser` middleware but no rate limiting. A malicious user could create hundreds of challenges to another user, each triggering a push notification, email, and in-app notification via `sendGameNotificationToUser`. This could be used to harass users via notification spam.

The WebSocket game handlers have rate limiting (`game:create: 3 per 60s`), but the REST API route does not.

**Recommendation:** Add a per-user rate limit (e.g., 5 challenges per hour) to the create game endpoint.

### H2: No Duplicate Challenge Prevention

**Location:** `server/routes/games-challenges.ts:58-71`
**Severity:** High
**Impact:** Game spam, UX degradation

There's no check for existing pending challenges between the same two players. A user can create unlimited pending challenges against the same opponent, each generating notifications.

**Recommendation:** Before creating a new game, check if a pending/active game already exists between the two players:
```sql
SELECT id FROM games WHERE status IN ('pending', 'active')
AND player1_id = ? AND player2_id = ? LIMIT 1
```

### H3: Video URL Accepted Without Validation of Storage Path

**Location:** `server/routes/games-shared.ts:39`, `server/services/gameTurnService.ts:128-142`
**Severity:** High
**Impact:** SSRF, content injection

The `submitTurnSchema` accepts any valid URL as `videoUrl`:
```typescript
videoUrl: z.string().url().max(500),
```

This means a user could submit arbitrary URLs (including internal/private URLs) as their "video." The URL is stored in the database and potentially rendered by other clients, creating SSRF/phishing vectors.

**Recommendation:** Validate that `videoUrl` matches an expected Firebase Storage URL pattern (e.g., `https://firebasestorage.googleapis.com/...` or `https://storage.googleapis.com/...`). Alternatively, have the server generate a signed upload URL and only accept storage paths, not raw URLs.

### H4: Game ID Not Validated as UUID in Route Params

**Location:** `server/routes/games-turns.ts:22`, `server/routes/games-management.ts:20`, multiple routes
**Severity:** High
**Impact:** SQL injection resistance depends entirely on Drizzle ORM

Game IDs from URL params (`req.params.id`) are used directly in queries without validating they are UUIDs. While Drizzle ORM parameterizes queries (preventing SQL injection), passing arbitrary strings could cause unexpected behavior with PostgreSQL's `gen_random_uuid()` default primary keys.

The judge turn endpoint correctly validates the turn ID as a strict integer (`/^\d+$/.test(req.params.turnId)`), but game ID params have no such validation.

**Recommendation:** Add a UUID format check on all game ID route params:
```typescript
const gameIdSchema = z.string().uuid();
```

### H5: `deadlineWarningsSent` In-Memory Map Grows Unbounded Under Load

**Location:** `server/routes/games-shared.ts:22`, `server/routes/games-cron.ts:112-130`
**Severity:** High
**Impact:** Memory leak in production

The `deadlineWarningsSent` Map is stored in process memory with cleanup only during cron runs. If the cron function runs infrequently or the server handles many games, this Map will grow without bound.

The cleanup only removes entries older than `TURN_DEADLINE_MS` (24 hours), meaning each game contributes an entry that persists for at least 24 hours. With 10,000 active games, this is ~10K entries — manageable. But the Map is also per-instance and not shared across horizontal scaling, as the code comment acknowledges.

**Recommendation:** Use a Redis SET with TTL for deduplication instead of an in-memory Map. Alternatively, add a max-size cap to the Map.

---

## Medium Findings

### M1: Trick Dictionary Diverged Between Web and Mobile

**Location:** `client/src/lib/game/trickDictionary.ts`, `mobile/src/lib/trickDictionary.ts`
**Severity:** Medium
**Impact:** Inconsistent UX, confusion

The web and mobile trick dictionaries have diverged:
- Web has 122 tricks, mobile has 109 tricks
- Different spellings: Web uses "Pop Shove-it" vs mobile's "Pop Shuvit", "360 Flip (Tre Flip)" vs "360 Flip"
- Mobile includes tricks not in web: "Alpha Flip", "Merlin Twist", "Darkslide", "McTwist", "900", etc.
- Web includes tricks not in mobile: "Shuv Underflip", "Dragon Flip", etc.

**Recommendation:** Extract the trick dictionary into `packages/shared/` so both platforms use the same canonical list.

### M2: Mobile Uses Firestore Real-Time Listeners While Web Uses REST Polling

**Location:** `mobile/src/hooks/useGameSession.ts:191-211`, `client/src/hooks/useSkateGameApi.ts:27-35`
**Severity:** Medium
**Impact:** Stale state on web, infrastructure complexity

The mobile app uses Firestore `onSnapshot` listeners for real-time game state updates, while the web client polls the REST API every 10 seconds (`refetchInterval: 10000`). This means:
- Web players see updates with up to 10-second lag
- Mobile players see updates instantly
- Two different databases may need to be kept in sync (Firestore + PostgreSQL)

**Recommendation:** Either migrate mobile to the REST API with polling or WebSocket updates, or add WebSocket push notifications to the web client for game state changes.

### M3: `gameActions.ts` Uses Direct Firestore Transactions (Client-Side)

**Location:** `client/src/lib/game/gameActions.ts`
**Severity:** Medium
**Impact:** Security bypass potential, deprecated code path

The `gameActions.ts` file implements game logic using **client-side Firestore transactions** (`runTransaction`). This means game rules (turn validation, letter assignment, game-over detection) are enforced on the client rather than the server. A modified client could:
- Skip their turn or play out of order
- Avoid getting letters
- Set `winnerId` to themselves

However, the web `skate-game.tsx` page uses the REST API hooks (`useSubmitTurn`, `useJudgeTurn`, etc.) rather than `gameActions.ts`. This file appears to be **dead code** or used only by an older code path.

**Recommendation:** If `gameActions.ts` is unused, remove it. If it's used by any code path, migrate to server-side validation.

### M4: No Forfeit Confirmation on Web Client

**Location:** `client/src/pages/skate-game.tsx:109-112`
**Severity:** Medium
**Impact:** Accidental forfeits

The forfeit handler calls `forfeitGame.mutate(gameId)` immediately without a confirmation dialog. An accidental tap/click on the forfeit button permanently ends the game with a loss.

**Recommendation:** Add a confirmation modal: "Are you sure you want to forfeit? This cannot be undone."

### M5: Challenge Response Endpoint Lacks Row Locking

**Location:** `server/routes/games-challenges.ts:114`
**Severity:** Medium
**Impact:** Race condition on challenge accept/decline

The `POST /api/games/:id/respond` endpoint reads the game state without `FOR UPDATE` locking:
```typescript
const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
```

If two requests arrive simultaneously (e.g., user rapidly taps "Accept"), both could read `status: "pending"` and both attempt to update. While PostgreSQL won't corrupt data, it could result in duplicate "game accepted" notifications or unexpected state.

Other game endpoints correctly use `SELECT FOR UPDATE` within transactions.

**Recommendation:** Wrap the respond endpoint in a transaction with `SELECT FOR UPDATE`.

### M6: `pendingTurnId` Logic May Return Wrong Turn

**Location:** `server/routes/games-management.ts:300-301`
**Severity:** Medium
**Impact:** Judging wrong turn

The logic to determine `pendingTurnId` for judging is:
```typescript
const pendingSetTurn = turns.find(
  (t) => t.result === "pending" && t.turnType === "set" && t.playerId !== currentUserId
);
const needsToJudge = game.turnPhase === "judge" && game.currentTurn === currentUserId;
```

`turns.find()` returns the **first** matching turn, which may not be the most recent one if there are multiple pending turns (edge case from interrupted transactions). The turns are ordered by `turnNumber`, so this returns the oldest pending set turn.

**Recommendation:** Use `findLast()` or reverse the array to get the most recent pending set turn, or use `turns.findLast(...)`.

### M7: Real-Time Game Multiplayer Skip Logic Has Infinite Loop Risk

**Location:** `server/services/game/tricks.ts:62-69`, `server/services/game/timeouts.ts:57-66`
**Severity:** Medium
**Impact:** Server hang, DoS

The `while` loop that skips eliminated players:
```typescript
while (
  isEliminated(state.players[nextTurnIndex].letters) &&
  skipAttempts < state.players.length
) {
  nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
  skipAttempts++;
}
```

The `skipAttempts` guard prevents true infinite loops, but if **all** players are eliminated (which shouldn't happen but could from a bug), the loop exits and the code proceeds with an eliminated player as the next turn holder. This wouldn't crash but would create a stuck game state.

In `passTrick` (line 237-242), the `attempts` counter from the outer loop bleeds into the `while` condition for finding a new setter, potentially breaking early:
```typescript
while (
  isEliminated(updatedPlayers[newSetterIndex].letters) &&
  attempts < state.players.length  // <-- 'attempts' was incremented in prior loop
) {
```

**Recommendation:** Use a fresh counter variable for each skip-elimination loop.

### M8: No Maximum Game Duration for Real-Time Games

**Location:** `server/services/game/constants.ts`
**Severity:** Medium
**Impact:** Resource exhaustion, zombie games

The async game system has a 7-day hard cap (`GAME_HARD_CAP_MS`), but the real-time `game_sessions` system has no equivalent. A paused game could remain in the database indefinitely if both players disconnect and never reconnect.

**Recommendation:** Add a hard cap (e.g., 1 hour total) for real-time game sessions and a cleanup cron job for stale `game_sessions` records.

### M9: Missing `thumbnailUrl` Column in Initial Migration

**Location:** `migrations/0002_create_games_tables.sql:31-42`
**Severity:** Medium
**Impact:** Schema drift

The initial `game_turns` table migration doesn't include `thumbnail_url` or `video_duration_ms` columns. These were added in `0006_async_skate_game.sql`. However, the Drizzle schema in `packages/shared/schema/games.ts` defines both columns. If the migrations are ever re-run from scratch on a fresh database, the `ALTER TABLE ADD COLUMN IF NOT EXISTS` in migration 0006 handles this gracefully, so this is more of a cleanliness issue.

**Recommendation:** Consider consolidating migrations or ensuring the initial migration includes all current columns for fresh deployments.

---

## Low / Informational Findings

### L1: Inconsistent Error Response Format

**Location:** Various routes
**Severity:** Low

Some routes use `Errors.badRequest(res, code, message)` (challenges), while others use `res.status(400).json({ error: "..." })` (turns, management). The inconsistent format makes client-side error handling more complex.

### L2: `gameId` Passed as Query Parameter on Web

**Location:** `client/src/pages/skate-game.tsx:48`
**Severity:** Low

The game ID is passed as `?gameId=...` query parameter rather than a URL path parameter (`/play/game/:id`). This is a design choice but means the game page URL is less clean and the game ID is visible in browser history/logs.

### L3: No Pagination on Turn History

**Location:** `server/routes/games-management.ts:287-291`
**Severity:** Low

The game details endpoint returns all turns for a game without pagination. For very long games, this could return large payloads. In practice, SKATE games have at most ~10 rounds (5 letters × 2 possible attempts), so this is unlikely to be an issue.

### L4: Mobile Upload Retry Doesn't Deduplicate Server-Side

**Location:** `mobile/src/hooks/useGameSession.ts:142-185`
**Severity:** Low

The mobile upload retry logic re-uploads the video blob on each retry. If the upload succeeds but the network response is lost, the retry will upload a duplicate file to Firebase Storage. The idempotency key prevents duplicate game state mutations, but duplicate video files will consume storage.

### L5: E2E Tests Use `waitForTimeout` (Flaky)

**Location:** `client/src/pages/skate-game.spec.ts:204`, multiple locations
**Severity:** Low

The Playwright E2E tests use `page.waitForTimeout(500)` and `page.waitForTimeout(CONFIG.ANIMATION_TIMEOUT)` for synchronization, which is inherently flaky. The spec file comment mentions "no flaky timeouts" but the implementation relies on them.

### L6: `opponentName` May Be Null in Notifications

**Location:** `server/services/gameNotificationService.ts:40-41`
**Severity:** Low

Several notification templates fall back to `"Someone"`, `"Opponent"`, or `"your opponent"` when `opponentName` is null. This shouldn't happen in normal flow since games require both player names, but forfeited or expired games could have null names if player2 never accepted.

---

## Positive Findings

The following security and engineering practices are well-implemented:

1. **Row-Level Locking:** All game state mutations use `SELECT FOR UPDATE` to prevent race conditions between concurrent requests, cron jobs, and forfeit actions.

2. **Idempotency Keys:** The real-time game system uses deterministic event IDs (`generateEventId`) with a processed-event dedup list to prevent duplicate state transitions from network retries.

3. **Input Validation:** All REST endpoints use Zod schemas with strict validation (string lengths, enum values, numeric ranges).

4. **Transaction Isolation:** Game state transitions are wrapped in PostgreSQL transactions, ensuring atomicity of multi-table updates.

5. **Authentication:** All game routes require `authenticateUser` middleware. Dispute resolution requires `requireAdmin`.

6. **Authorization Checks:** Every endpoint verifies the requesting user is a participant in the game before allowing actions.

7. **Rate Limiting (WebSocket):** Socket.IO game events have per-event rate limits (3-10 per 60s) to prevent spam.

8. **Turn Phase Validation:** Both the async and real-time systems validate that the correct player is acting in the correct phase before accepting actions.

9. **Notifications Outside Transactions:** All notification sends happen after transaction commits, preventing notification sends for rolled-back state changes.

10. **Cleanup on Disconnect:** The real-time system properly handles player disconnection with reconnection windows and automatic forfeit on timeout.

11. **Setter Bail Rule:** The implementation of the setter-bail S.K.A.T.E. rule (setter takes their own letter if they can't land what they set) is correct and handles game-over edge cases.

12. **Mobile Zod Validation:** The mobile `useGameSession.ts` validates all Firestore data through comprehensive Zod schemas before using it, preventing crashes from malformed data.

---

## Test Coverage Assessment

### Existing Test Files

| File | Coverage Area |
|------|---------------|
| `server/__tests__/services/game-critical-paths.test.ts` | Core game state transitions |
| `server/__tests__/services/game-state-transitions.test.ts` | Phase transition validation |
| `server/__tests__/services/game-state-types.test.ts` | Type safety |
| `server/__tests__/services/game-timeouts.test.ts` | Timeout processing |
| `server/__tests__/services/gameStateService.test.ts` | Game state CRUD |
| `server/__tests__/services/gameDisputeService.test.ts` | Dispute filing/resolution |
| `server/__tests__/services/gameTurnService.test.ts` | Turn submission/judging |
| `server/__tests__/routes/games-*.test.ts` (6 files) | Route-level integration |
| `server/socket/handlers/__tests__/game.test.ts` | Socket handler unit tests |
| `server/socket/handlers/__tests__/game.integration.test.ts` | Socket integration |
| `mobile/src/store/gameStore.test.ts` | Mobile store logic |
| `mobile/src/hooks/useGameSession.test.ts` | Mobile session hook |
| `mobile/src/lib/__tests__/gameIdValidation.test.ts` | ID validation |
| `client/src/lib/game/__tests__/trickDictionary.test.ts` | Trick search |
| `client/src/pages/skate-game.spec.ts` | E2E Playwright tests |
| `client/cypress/e2e/game-flow.cy.ts` | Cypress E2E |
| `mobile/e2e/game-flow.e2e.js` | Mobile E2E (Detox) |

### Coverage Gaps

1. **No tests for dispute letter-removal logic** (C2) — the bug in `gameDisputeService.ts` would be caught by a test that verifies which player's letter gets removed when a dispute is overturned.
2. **No tests for concurrent challenge creation** (H2) — testing what happens when the same user creates multiple challenges simultaneously.
3. **No tests for the `setterBail` service** within `gameTurnService.ts` — while there's a route test, the service function itself needs unit tests verifying game-over detection after setter bail.
4. **No negative-path tests for video URL validation** — ensuring malicious URLs are rejected.
5. **No load/stress tests** for the `deadlineWarningsSent` Map growth (H5).

---

## Recommendations Summary (Prioritized)

### Immediate (Before Next Release)

1. **Fix C2:** Correct the dispute letter removal to target `dispute.disputedBy` instead of `dispute.againstPlayerId`
2. **Fix H1:** Add rate limiting to `POST /api/games/create`
3. **Fix H2:** Add duplicate challenge prevention check
4. **Fix H3:** Validate `videoUrl` matches expected Firebase Storage URL patterns

### Short-Term (Next Sprint)

5. **Fix H4:** Add UUID validation for game ID route params
6. **Fix H5:** Replace in-memory `deadlineWarningsSent` with Redis TTL key
7. **Fix M5:** Add `SELECT FOR UPDATE` to challenge response endpoint
8. **Fix M7:** Use fresh counter variables in elimination-skip loops
9. **Fix M4:** Add forfeit confirmation dialog on web

### Medium-Term (Next Quarter)

10. **Fix C1:** Unify game type definitions between Firestore and PostgreSQL schemas
11. **Fix M1:** Consolidate trick dictionaries into shared package
12. **Fix M2:** Align mobile and web on a single real-time strategy
13. **Fix M3:** Remove or deprecate `gameActions.ts` client-side Firestore transactions
14. **Fix M8:** Add hard cap and cleanup for real-time game sessions
15. **Fix M6:** Use `findLast()` for pending turn resolution

---

*End of audit report.*
