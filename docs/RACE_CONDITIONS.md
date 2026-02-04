# Race Conditions in S.K.A.T.E. Game Loop

This document lists all identified race conditions in the S.K.A.T.E. battle system and their mitigations.

## Identified Race Conditions

### 1. Simultaneous Vote Submission (FIXED)

**Scenario:** Both attacker and defender submit their votes at the exact same millisecond.

**Previous behavior:**

- Both clients read game state with no votes recorded
- Both clients check "has user already voted" → both pass
- Both clients write their vote
- Last write wins, potentially losing one vote or corrupting state

**Mitigation:**

- All vote operations now use Firestore transactions (`db.runTransaction`)
- The transaction reads game state, validates, and writes atomically
- If another write occurs during the transaction, Firestore automatically retries
- Location: `infra/firebase/functions/index.ts` - `judgeTrick` function

### 2. Duplicate Event Submission (FIXED)

**Scenario:** Player submits a trick, request fails after server processes it but before client receives response. Client retries, potentially creating duplicate moves.

**Previous behavior:**

- No deduplication mechanism
- Retry could create duplicate moves or corrupt game state

**Mitigation:**

- Client generates unique `idempotencyKey` for each submission
- Server tracks last 50 processed idempotency keys in `processedIdempotencyKeys` array
- If duplicate key detected, server returns cached result without re-processing
- Location: `infra/firebase/functions/index.ts` - `submitTrick` and `judgeTrick` functions

### 3. Client-Side Game State Mutation (FIXED)

**Scenario:** Malicious or buggy client directly writes to Firestore, bypassing validation.

**Previous behavior:**

- Client used `updateDoc` to directly modify game state
- No server-side validation of turn order, phase, or player role

**Mitigation:**

- All game state mutations now go through Cloud Functions
- `submitTrick` Cloud Function validates:
  - Caller is a game participant
  - It is the caller's turn
  - Game is in correct phase for the action
  - Caller has correct role (attacker/defender)
- Direct Firestore writes should be blocked by security rules (TODO: verify rules)
- Location: `infra/firebase/functions/index.ts` - `submitTrick` function

### 4. Vote and Timeout Simultaneous Trigger (FIXED)

**Scenario:** Timeout triggers at the exact moment a vote is submitted.

**Previous behavior:**

- No timeout was implemented
- Games could stall indefinitely if players didn't vote

**Mitigation:**

- 60-second vote timeout implemented via scheduled Cloud Function (`processVoteTimeouts`)
- `voteDeadline` timestamp set when entering judging phase
- Timeout function uses transactions to prevent race conditions
- If vote arrives during timeout transaction, Firestore retries automatically
- Whichever completes first wins; the other sees state has changed and aborts
- Auto-resolve always gives defender benefit of doubt (result = "landed")
- Push notification sent at 30 seconds before deadline
- Location: `functions/src/index.ts` - `processVoteTimeouts`, `autoResolveVoteTimeout`

### 5. Player Joins Mid-Turn (ANALYZED - LOW RISK)

**Scenario:** Player 2 joins a game while Player 1 is mid-action.

**Analysis:**

- Game status transitions: `waiting` → `active` when both players have joined
- During `waiting` status, only Player 1 can be in the game
- The `useJoinGame` mutation sets status to `active`
- No race condition exists because:
  - Only one player can join (the challenged player)
  - Game actions require `status === 'active'`
  - Transaction in `submitTrick` validates status

**Risk level:** Low - existing flow prevents this scenario

### 6. Stale Client Cache Read (MITIGATED)

**Scenario:** Client reads game state from React Query cache, which is stale, and makes decisions based on outdated data.

**Previous behavior:**

- `useSubmitTrick` read from `queryClient.getQueryData()`
- This cache could be seconds behind Firestore

**Mitigation:**

- Game state validation moved to server (Cloud Function)
- Server always reads fresh state in transaction
- Client cache staleness no longer affects correctness
- Location: `infra/firebase/functions/index.ts`

## Transaction Guarantees

All game state mutations now use Firestore transactions, which provide:

1. **Atomicity:** All reads and writes in a transaction succeed or fail together
2. **Isolation:** Concurrent transactions are serialized
3. **Consistency:** If another write occurs during transaction, Firestore retries automatically (up to 25 times)

## Idempotency Key Implementation

```typescript
// Client generates key before each request
const idempotencyKey = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

// Server tracks processed keys (last 50 to bound storage)
processedIdempotencyKeys: [...processedKeys.slice(-49), idempotencyKey];
```

The 50-key limit is sufficient because:

- Keys are timestamp-prefixed, so old keys naturally age out
- A typical game has ~20-40 moves total
- Network retries happen within seconds, not minutes

## Testing Race Conditions

Race conditions are tested in `infra/firebase/functions/judgeTrick.test.ts`:

- `should record attacker vote and wait for defender` - Verifies partial state
- `should complete judgment when both vote the same` - Verifies atomic completion
- `should give defender benefit of doubt when votes disagree` - Verifies tie-breaking

Additional integration tests should be added to verify transaction behavior under load.

## TODO

- [ ] Add Firestore security rules to block direct client writes to `game_sessions`
- [x] Implement vote timeout (Problem 2) - DONE
- [ ] Add integration tests that simulate concurrent requests
- [ ] Monitor transaction retry rates in production

## Vote Timeout Implementation Details

The vote timeout system ensures games don't stall when players fail to vote:

1. **Deadline Setting**: When a defender submits their trick (entering judging phase), `voteDeadline` is set to 60 seconds in the future.

2. **Scheduled Function**: `processVoteTimeouts` runs every 15 seconds to:
   - Send reminder notifications at 30 seconds before deadline
   - Auto-resolve expired deadlines

3. **Auto-Resolution Logic**:
   - Defender always gets benefit of doubt (result = "landed")
   - Roles switch (defender becomes attacker)
   - No letter is given to anyone
   - `voteTimeoutOccurred` flag is set for UI feedback

4. **Push Notifications**:
   - 30-second reminder: "Vote Required! 30 seconds left to judge the trick."
   - Timeout notification: "Vote Timed Out. Trick counted as landed."

5. **Edge Cases Handled**:
   - Both players fail to vote → defender wins
   - Attacker votes, defender doesn't → defender wins
   - Defender votes, attacker doesn't → defender wins
