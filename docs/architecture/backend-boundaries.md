# Backend Boundaries

This repo uses a hybrid backend. The rule is explicit:

```
Express (server) = Authoritative writes to PostgreSQL
Firestore        = Read-optimized projections for real-time client subscriptions
```

> **Canonical Reference:** See [DATA_BOUNDARIES.md](./DATA_BOUNDARIES.md) for the complete field-by-field ownership table.

## Data Flow Table

| Feature | Write Path | Read Path | Canonical Store | Notes |
|---------|------------|-----------|-----------------|-------|
| User identity | REST /api/auth | REST | PostgreSQL `customUsers` | Firebase verifies tokens, PostgreSQL stores user data |
| User profiles | REST /api/profile | Firestore (real-time) or REST | PostgreSQL `userProfiles` | Firestore `users` is a projection |
| XP and level | REST (check-in, challenge) | Firestore `users` | PostgreSQL `userProfiles.xp`, `userProfiles.level` | Computed on server, synced to Firestore |
| Check-ins | REST /api/checkins | REST | PostgreSQL `checkIns` | Nonce enforced (one per day per spot) |
| Active presence | Firestore direct | Firestore | Firestore `activeCheckins` | Ephemeral, no PostgreSQL mirror |
| Leaderboard | REST admin job | Firestore `leaderboardLive` | PostgreSQL (derived) | Computed from userProfiles + checkIns |
| Games (active) | REST /api/games | Firestore `gameSessions` | PostgreSQL `games` | Firestore mirrors active state |
| Games (completed) | REST /api/games | REST | PostgreSQL `games` | Final results only in PostgreSQL |
| Chat messages | Firestore direct | Firestore | Firestore `chatMessages` | Ephemeral, no PostgreSQL backing |
| Spots | REST /api/spots | REST | PostgreSQL `spots` | No Firestore mirror |

## Rules of Engagement

1. **PostgreSQL is the only source of truth** for uniqueness, identity, and persistent state.
2. **Firestore is read-optimized** and treated as a projection layer for real-time client UX.
3. **Server writes to PostgreSQL first**, then syncs to Firestore when needed.
4. **Clients never write directly to PostgreSQL**. All mutations go through REST APIs.
5. **Cloud Functions may write to Firestore** as a mirror, not as an authority.

## When to Use Each Store

### Use PostgreSQL When:
- Data needs to survive long-term (history, records)
- Data requires uniqueness constraints (usernames, emails)
- Data participates in joins or aggregations (leaderboards)
- Data is the input to business logic (XP calculations)

### Use Firestore When:
- Clients need real-time subscriptions (live game state)
- Data is ephemeral (online presence, active check-ins)
- Data is chat/messaging (no long-term value)
- You need instant updates without polling

### Never Do:
- Write to Firestore without writing to PostgreSQL first (for persistent data)
- Trust Firestore data as authoritative in server-side business logic
- Create fields in Firestore that don't exist in PostgreSQL (for persistent data)
- Use different field names in Firestore vs PostgreSQL for the same concept
