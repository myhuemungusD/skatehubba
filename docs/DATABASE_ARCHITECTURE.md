# SkateHubba Enterprise Database Architecture

## Overview

SkateHubba uses a **hybrid database architecture** optimized for cost, performance, and scalability.

**Design Principle:** Use the right database for the right job.

---

## Database Responsibilities

### PostgreSQL (Neon) - Primary Data Store

**Purpose:** All structured, relational, and transactional data

**What Lives Here:**
- ✅ User profiles (`customUsers` table)
  - Email, name, bio, roles, preferences
  - **Single source of truth** for user data
  - Keyed by Firebase UID
  
- ✅ Spots & Check-ins
  - Spot locations, ratings, photos
  - User check-in history
  - Streak calculations
  
- ✅ Products & E-commerce
  - Shop inventory, orders, transactions
  
- ✅ Analytics & Metrics
  - Event tracking, KPIs, dashboards
  - Aggregations and time-series data
  
- ✅ Sessions
  - Login sessions (connect-pg-simple)
  
- ✅ Games & Tournaments
  - Match history, leaderboards, rankings

**Why PostgreSQL:**
- Strong relational queries (joins, aggregations)
- ACID compliance for transactions
- Cost-effective at scale (~$20-50/mo for 100k users)
- Drizzle ORM provides type safety

**Connection:**
```typescript
// server/db.ts
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema });
```

---

### Firebase - Real-time & Authentication

**Purpose:** Authentication, real-time features, and push notifications

**What Lives Here:**

#### 1. Authentication (Firebase Auth)
- User sign-up, login, password reset
- OAuth providers (Google, Apple)
- Email verification, phone verification
- **No user profile data** (use Postgres instead)

#### 2. Real-time Features (Firestore)
- ✅ Active challenges/battles (`/challenges/{id}`)
  - Current turn, opponent, deadline
  - Live updates during gameplay
  
- ✅ Chat messages (`/chats/{id}`)
  - Real-time messaging
  - Read receipts, typing indicators
  
- ✅ Presence (`/presence/{uid}`)
  - Online/offline status
  - Last seen timestamp
  
- ❌ User profiles (moved to Postgres)
- ❌ Static spot data (moved to Postgres)

#### 3. Storage (Firebase Storage)
- User-uploaded media (photos, videos)
- Spot images
- Challenge video clips

#### 4. Notifications (FCM)
- Push notifications for challenges, messages, etc.

**Why Firebase:**
- Built for real-time subscriptions
- Handles auth complexity (OAuth, MFA, etc.)
- Auto-scaling for FCM
- Offline-first mobile support

**Cost at Scale:**
- ~$50-100/mo (auth + realtime only)
- Would be $200-500/mo if storing all user data

---

## Data Flow Patterns

### User Signup
```typescript
// 1. Create Firebase auth user
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
const uid = userCredential.user.uid;

// 2. Create Postgres profile (single source of truth)
await db.insert(customUsers).values({
  id: uid,  // Firebase UID as primary key
  email,
  firstName,
  lastName,
  createdAt: new Date()
});

// 3. NO Firestore user document (unless needed for presence)
```

### User Profile Update
```typescript
// Update Postgres only
await db.update(customUsers)
  .set({ bio, location })
  .where(eq(customUsers.id, uid));

// NO Firestore sync needed
```

### Check-in Flow
```typescript
// 1. Validate location (server-side)
// 2. Insert check-in to Postgres
await db.insert(checkIns).values({
  userId: uid,
  spotId,
  timestamp: new Date(),
  isAr: false
});

// 3. Update spot stats (Postgres)
await db.update(spots)
  .set({ checkInCount: sql`${spots.checkInCount} + 1` })
  .where(eq(spots.id, spotId));

// NO Firestore involvement
```

### Challenge Flow (Real-time)
```typescript
// 1. Create challenge record in Postgres (for history)
const [challenge] = await db.insert(games).values({
  player1Id: uid,
  player2Id: opponentId,
  status: 'active'
}).returning();

// 2. Create Firestore doc for real-time updates
await setDoc(doc(db, 'challenges', challenge.id), {
  currentTurn: uid,
  deadline: serverTimestamp(),
  player1: { uid, currentLetter: 'S' },
  player2: { uid: opponentId, currentLetter: null }
});

// 3. Client subscribes to Firestore for live updates
onSnapshot(doc(db, 'challenges', challengeId), (snap) => {
  // Update UI instantly
});

// 4. On completion, update Postgres for permanent record
await db.update(games)
  .set({ status: 'completed', winnerId: uid })
  .where(eq(games.id, challengeId));
```

---

## Migration Status

### ✅ Completed
- PostgreSQL connection and schema setup
- User profiles in `customUsers` table
- Spots and check-ins in Postgres
- Drizzle ORM integration

### 🔄 In Progress
- Remove Firestore user duplication
- Update `set-admin.ts` to use Postgres only
- Add database service layer abstraction

### 📋 Planned
- Migrate challenge history to Postgres
- Add Firestore rules restricting user writes
- Create data migration scripts

---

## Development Guidelines

### Where to Add New Data

**Ask yourself:**
1. **Does it need real-time updates?** → Firebase
2. **Is it relational/transactional?** → PostgreSQL
3. **Is it user-uploaded media?** → Firebase Storage

**Examples:**
- User leaderboard → **PostgreSQL** (joins, aggregations)
- Live chat → **Firebase** (real-time subscriptions)
- Product inventory → **PostgreSQL** (ACID transactions)
- Active battle state → **Firebase** (instant updates)
- Battle history → **PostgreSQL** (analytics, reporting)

### Querying User Data

**Always use Postgres as the source of truth:**

```typescript
// ✅ Correct
const user = await db.select()
  .from(customUsers)
  .where(eq(customUsers.id, uid))
  .limit(1);

// ❌ Wrong - Don't query Firestore for user profiles
const userDoc = await getDoc(doc(firestore, 'users', uid));
```

### Real-time Features

**Use Firestore only for live updates:**

```typescript
// ✅ Correct - Firestore for real-time state
onSnapshot(doc(firestore, 'challenges', challengeId), (snap) => {
  updateUI(snap.data());
});

// ✅ Also correct - Save final result to Postgres
await db.insert(games).values({
  winnerId: uid,
  finalScore: score
});
```

---

## Cost Breakdown

### Current (Optimized Hybrid)
- **Neon PostgreSQL:** ~$20-50/mo
- **Firebase (Auth + Realtime):** ~$50-100/mo
- **Total:** ~$70-150/mo at 100k users

### Alternative: All Firebase
- **Firestore:** ~$200-500/mo (reads are expensive)
- **Total:** ~$200-500/mo at 100k users

### Alternative: All Postgres (Supabase)
- **Supabase:** ~$25-75/mo
- **Need custom realtime:** +$50-100/mo
- **Total:** ~$75-175/mo at 100k users

**Winner:** Hybrid (current) = Best cost + best DX

---

## Security Model

### PostgreSQL
- Row-level security via application layer
- `authenticateUser` middleware validates Firebase token
- Drizzle queries use parameterized statements (SQL injection safe)

### Firebase
- Firestore security rules restrict writes
- Authentication required for all operations
- Rules validate user can only modify their own data

---

## Backup & DR

### PostgreSQL (Neon)
- Automatic daily backups (7-day retention)
- Point-in-time recovery
- Replica available for read scaling

### Firebase
- Automatic replication across zones
- Export to Cloud Storage for long-term backup
- Firestore has 99.999% uptime SLA

---

## Monitoring

### PostgreSQL
- Neon dashboard for query performance
- Drizzle logs slow queries
- Server logs connection pool metrics

### Firebase
- Firebase Console for auth metrics
- Firestore usage dashboard
- Firebase Performance Monitoring

---

## Questions?

- **"Why not just use Supabase?"** - We get Firebase auth for free (already integrated), and Neon is cheaper than Supabase Pro.
- **"Why not all Firestore?"** - Cost at scale. Reads are $0.06/100k in Firestore vs. effectively free in Postgres.
- **"Why not all Postgres?"** - Real-time subscriptions are complex to build. Firebase does this out of the box.

---

**This architecture balances:**
- ✅ Low cost
- ✅ Type safety (Drizzle)
- ✅ Real-time features (Firebase)
- ✅ Powerful queries (PostgreSQL)
- ✅ Proven scalability
