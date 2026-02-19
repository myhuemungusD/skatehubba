# Data Boundaries

This document defines the canonical storage location for every piece of data in SkateHubba. **Every field has exactly one authoritative home.** Firestore is a read-optimized projection layer, never a source of truth.

## The Rule

```
PostgreSQL = Source of Truth (writes, uniqueness, identity, history)
Firestore  = Real-Time Projection (reads, subscriptions, ephemeral state)
```

If data exists in both places, PostgreSQL wins. Firestore is updated via sync jobs or write-through patterns from the server. Clients read from Firestore for real-time UX but the server always writes to PostgreSQL first.

---

## PostgreSQL Owns (Authoritative)

### Users & Identity

| Table | Fields | Notes |
|-------|--------|-------|
| `customUsers` | id, email, passwordHash, firstName, lastName, firebaseUid, isEmailVerified, trustLevel, isActive, createdAt | Core identity. Keyed by internal UUID. |
| `usernames` | uid, username | Unique username reservation. UID is Firebase UID. |
| `userProfiles` | id (Firebase UID), handle, displayName, bio, photoURL, stance, homeSpot, **xp**, wins, losses, disputePenalties, filmerRepScore, filmerVerified, roles | Extended profile. **XP is authoritative here. Level is computed: `Math.floor(xp / 500) + 1`.** |
| `authSessions` | userId, token, expiresAt | Server-side session management. |

### Spots & Check-ins

| Table | Fields | Notes |
|-------|--------|-------|
| `spots` | id, name, lat, lng, tier, spotType, checkInCount, rating, verified, createdBy | All spot data. |
| `checkIns` | id, userId, spotId, timestamp, isAr, filmerUid, filmerStatus | Historical check-in records. One per user per spot per day. |
| `filmerRequests` | id, checkInId, requesterId, filmerId, status | Filmer attribution workflow. |

### Games & Competition

| Table | Fields | Notes |
|-------|--------|-------|
| `games` | id, player1Id, player2Id, status, currentTurn, letters, winnerId, completedAt | S.K.A.T.E. game records. **Final results live here.** |
| `gameTurns` | id, gameId, playerId, turnNumber, trickDescription, result, judgedBy | Turn-by-turn history. |
| `battles` | id, creatorId, opponentId, status, winnerId, clipUrl | 1v1 battle records. |
| `battleVotes` | id, battleId, odv, vote | Battle voting. |
| `challenges` | id, challengerId, challengedId, status, gameId | Challenge requests. |

### Progression

| Table | Fields | Notes |
|-------|--------|-------|
| `trickMastery` | userId, trick, level, landedCount, streak | Trick progression per user. |
| `closetItems` | id, userId, type, brand, name, imageUrl, rarity | Collectible gear. |

### Commerce & Admin

| Table | Fields | Notes |
|-------|--------|-------|
| `products`, `orders`, `donations` | All fields | E-commerce data. |
| `auditLogs`, `loginAttempts`, `accountLockouts` | All fields | Security and compliance. |
| `feedback` | All fields | User feedback. |

---

## Firestore Owns (Authoritative)

These collections are the source of truth because they represent ephemeral or real-time-only state that doesn't need permanent storage:

| Collection | Purpose | Why Firestore |
|------------|---------|---------------|
| `chatMessages` | AI Skate Buddy conversations | Ephemeral chat, no long-term value |
| `presence` | Online/offline status | Inherently real-time, no history needed |
| `activeCheckins` | Currently checked-in users at spots | Ephemeral presence, expires on checkout |

---

## Firestore Projections (Read-Only Mirror)

These collections mirror PostgreSQL data for real-time client subscriptions. **The server writes here after writing to PostgreSQL.** Clients should never trust these as authoritative.

| Collection | Mirrors | Sync Trigger |
|------------|---------|--------------|
| `users` | `userProfiles` (subset) | Profile update API |
| `gameSessions` | `games` (active only) | Game state change API |
| `leaderboardLive` | Computed from `userProfiles` + `checkIns` | Admin job / check-in event |
| `notifications` | Server-generated | Server creates after relevant events |
| `challengeVotes` | `battleVotes` for active battles | Vote submission |

### Firestore `users` Collection Schema

This is a **projection** of PostgreSQL `userProfiles`. It contains a subset of fields optimized for client reads:

```typescript
interface FirestoreUserProfile {
  userId: string;        // Same as userProfiles.id
  displayName: string;   // Mirrored from userProfiles
  photoURL?: string;     // Mirrored from userProfiles
  xp: number;            // Mirrored from userProfiles.xp
  level: number;         // Computed: Math.floor(xp / 500) + 1
  isPro: boolean;        // Derived from subscription status
  role: "skater" | "filmer" | "pro";
  updatedAt: Timestamp;
}
```

---

## Field Ownership Reference

When someone asks "where does X live?", this table answers:

| Field | Authoritative Store | Projection |
|-------|---------------------|------------|
| User XP | `userProfiles.xp` (PostgreSQL) | `users.xp` (Firestore) |
| User Level | Computed: `Math.floor(xp / 500) + 1` | `users.level` (Firestore, derived from xp) |
| User Points | Removed - use XP instead | - |
| Check-in History | `checkIns` (PostgreSQL) | None |
| Active Check-in Status | `activeCheckins` (Firestore) | None |
| Leaderboard Rank | Computed from PostgreSQL | `leaderboardLive` (Firestore) |
| Game Result | `games` (PostgreSQL) | None |
| Active Game State | `games` (PostgreSQL) | `gameSessions` (Firestore) |
| Trick Mastery | `trickMastery` (PostgreSQL) | None |
| Chat Messages | `chatMessages` (Firestore) | None |
| Online Status | `presence` (Firestore) | None |

---

## Sync Patterns

### Write-Through (Immediate)

Used for data that must be consistent in real-time:

```typescript
// Example: Update user profile
async function updateUserProfile(uid: string, updates: Partial<UserProfile>) {
  // 1. Write to PostgreSQL (authoritative)
  await db.update(userProfiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(userProfiles.id, uid));

  // 2. Sync to Firestore (projection)
  await firestore.collection("users").doc(uid).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
```

### Event-Driven (Eventually Consistent)

Used for computed data like leaderboards:

```typescript
// Example: After check-in, update leaderboard
async function onCheckIn(userId: string) {
  // PostgreSQL is already updated by check-in endpoint

  // Queue leaderboard recalculation
  await leaderboardQueue.add({ userId });
}

// Background job
async function updateLeaderboard(userId: string) {
  const stats = await db.select({
    xp: userProfiles.xp,
    totalCheckIns: sql`COUNT(${checkIns.id})`,
  })
  .from(userProfiles)
  .leftJoin(checkIns, eq(checkIns.userId, userId))
  .where(eq(userProfiles.id, userId));

  await firestore.collection("leaderboardLive").doc(userId).set({
    ...stats,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
```

---

## Migration Notes

### Consolidating XP and Points

The PostgreSQL `userProfiles.points` field was ambiguous. Going forward:

- **`xp`** is the single currency for progression (check-ins, challenges, achievements)
- **`level`** is computed: `Math.floor(xp / 500) + 1`
- The `points` field is deprecated and should be migrated to `xp`

### Adding XP to PostgreSQL Schema

The `userProfiles` table needs these columns added:

```sql
ALTER TABLE user_profiles ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
```

After migration, remove the `points` column:

```sql
ALTER TABLE user_profiles DROP COLUMN points;
```

---

## Code Review Checklist

When reviewing PRs that touch data storage:

- [ ] Is the data being written to the correct authoritative store?
- [ ] If writing to Firestore, is there a corresponding PostgreSQL write first?
- [ ] Is the Firestore collection marked as a projection or authoritative in this document?
- [ ] Are real-time subscriptions reading from Firestore (not hitting PostgreSQL repeatedly)?
- [ ] Is the sync pattern documented if introducing a new mirrored collection?

---

## Anti-Patterns

### Writing to Firestore First

```typescript
// BAD: Firestore as source of truth
await firestore.collection("users").doc(uid).update({ xp: newXp });

// GOOD: PostgreSQL first, then sync
await db.update(userProfiles).set({ xp: newXp }).where(eq(id, uid));
await firestore.collection("users").doc(uid).update({ xp: newXp });
```

### Reading PostgreSQL for Real-Time UI

```typescript
// BAD: Polling PostgreSQL
useEffect(() => {
  const interval = setInterval(async () => {
    const user = await fetch(`/api/users/${uid}`);
    setUser(user);
  }, 1000);
}, []);

// GOOD: Subscribe to Firestore projection
useEffect(() => {
  return onSnapshot(doc(firestore, "users", uid), (snap) => {
    setUser(snap.data());
  });
}, []);
```

### Dual-Source Confusion

```typescript
// BAD: Different schemas in different stores
// PostgreSQL: { points: 100 }
// Firestore:  { xp: 150 }  // Which is correct?

// GOOD: Single authoritative value
// PostgreSQL: { xp: 150 }  // Authoritative
// Firestore:  { xp: 150 }  // Mirrored from PostgreSQL
```

---

## Summary

| Store | Role | Writes | Reads |
|-------|------|--------|-------|
| PostgreSQL | Source of truth | Server only | Server (for APIs, business logic) |
| Firestore | Real-time projection | Server only (after PostgreSQL) | Client (for subscriptions) |

**When in doubt: PostgreSQL is the answer.**
