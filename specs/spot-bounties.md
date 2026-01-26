# SkateHubba Spot Bounties — Locked Engineering Spec v1 (Firebase + Next.js + Unity AR)

This is written so you can build it without guessing. It assumes Firestore + Firebase Auth + Cloud Functions + FCM, and the current app stack. Crypto is not required for v1.

## 0) Goals and non-goals

### Goals (v1)

- Spot-bound bounties that users can post.
- Claims with video uploads + optional filmer tag.
- Verification by community voting + optional creator/pro override.
- Payouts in in-app balance (and/or “store credit”) with platform fee + filmer split.
- Strong abuse controls (rate limits, reputation, vote gating).
- Clean audit trail.

### Non-goals (v1)

- On-chain payouts / wallets.
- Automated trick detection.
- Full AR template matching (we’ll store hooks for v2).

## 1) Firestore Collections (canonical)

All IDs are Firestore doc IDs (random). Timestamps are Firestore Timestamp.

### 1.1 /spots/{spotId}

You likely already have this. Needed fields:

- name: string
- geo: { lat: number, lng: number }
- geohash?: string (if you use geo queries)
- isLegendary?: boolean

### 1.2 /bounties/{bountyId}

Primary object.

```ts
type BountyStatus = "OPEN" | "LOCKED" | "EXPIRED" | "CANCELLED" | "VERIFIED" | "PAID";

type RewardType = "CREDIT" | "GEAR" | "CASH"; // v1 uses CREDIT; other types are tracked but paid manually

type Bounty = {
  spotId: string;
  creatorUid: string;

  trickDesc: string;              // "BS 360 KICKFLIP OUT"
  rules?: string;                 // optional
  requirements?: {
    oneTake?: boolean;            // default true
    mustShowSpot?: boolean;       // default true
    maxClipSeconds?: number;      // default 20
  };

  rewardType: RewardType;         // v1: CREDIT
  rewardTotal: number;            // integer cents or integer credits (pick one and stick to it)
  currency: "HUBBA_CREDIT";       // locked for v1

  platformFeeBps: number;         // e.g. 1000 = 10%
  filmerCutBps: number;           // e.g. 2000 = 20% (of net after platform fee, see payout math)

  status: BountyStatus;

  createdAt: Timestamp;
  expiresAt: Timestamp;

  // Counters (maintained by CF only)
  claimCount: number;
  voteCount: number;

  // Verification policy
  verifyPolicy: {
    minVotes: number;             // e.g. 5
    approveRatio: number;         // e.g. 0.6 => 60% approvals required
    proVoteWeight: number;        // e.g. 2 (v2 can use)
  };

  // Locks to prevent double-pay and last-second changes
  lockedAt?: Timestamp;
  lockedReason?: string;

  // Optional AR hook (v2)
  ar?: {
    templateVersion: number;
    templateRef?: string;         // pointer to storage/doc
  };
};
```

#### Recommended defaults (v1)

- platformFeeBps = 1000
- filmerCutBps = 2000
- verifyPolicy.minVotes = 5
- verifyPolicy.approveRatio = 0.6
- requirements.oneTake = true
- requirements.maxClipSeconds = 20

### 1.3 /bounties/{bountyId}/claims/{claimId}

```ts
type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "PAID";

type Claim = {
  bountyId: string;               // redundancy for queries
  spotId: string;

  claimerUid: string;
  createdAt: Timestamp;

  clip: {
    storagePath: string;          // "claims/{bountyId}/{claimId}.mp4"
    downloadUrl?: string;         // optional cache; do not trust
    durationSeconds?: number;
    mimeType?: string;
    sizeBytes?: number;
    thumbPath?: string;           // optional
  };

  filmer?: {
    uid: string;
    confirmed: boolean;
    confirmedAt?: Timestamp;
  };

  // Verification
  status: ClaimStatus;
  approvedAt?: Timestamp;
  rejectedAt?: Timestamp;
  decisionBy?: {
    uid: string;
    role: "CREATOR" | "PRO" | "ADMIN" | "AUTO";
  };
  decisionNote?: string;

  // Voting
  votes: {
    approveCount: number;
    rejectCount: number;
    weightedApprove: number;      // v2-ready
    weightedReject: number;
    lastVoteAt?: Timestamp;
  };

  // AR hook (v2)
  arValidation?: {
    score?: number;               // 0..1
    meta?: Record<string, any>;
  };

  // Payout
  payout?: {
    platformFee: number;
    netReward: number;
    claimerAmount: number;
    filmerAmount: number;
    txId?: string;                // internal ledger tx id
    paidAt?: Timestamp;
  };

  // Abuse / moderation
  flags?: {
    reportCount: number;
    reportedBy?: string[];        // optional small list; or store subcollection
  };
};
```

### 1.4 /bounties/{bountyId}/claims/{claimId}/votes/{voteId}

VoteId = voterUid (one vote per user per claim).

```ts
type Vote = {
  voterUid: string;
  createdAt: Timestamp;
  vote: "APPROVE" | "REJECT";
  weight: number;                 // v1 always 1
  comment?: string;               // optional
};
```

### 1.5 /users/{uid}

You likely already have profile. Add:

```ts
type UserTier = "SKATER" | "FILMER" | "PRO" | "SPONSOR" | "ADMIN";

type UserBountyStats = {
  reputation: number;             // start 50
  claimsWon: number;
  claimsRejected: number;
  filmsCredited: number;
  bountiesPosted: number;

  // abuse/rate limiting state (server-owned)
  lastBountyAt?: Timestamp;
  monthlyBountyCount?: number;    // reset monthly by CF
};

type UserDoc = {
  tier: UserTier;
  tierVerified: boolean;

  bountyStats: UserBountyStats;

  wallet: {
    hubbaCredit: number;          // integer credits/cents
  };
};
```

### 1.6 /ledger/{txId}

Immutable internal accounting record.

```ts
type LedgerTxType =
  | "BOUNTY_POST_HOLD"
  | "BOUNTY_REFUND"
  | "CLAIM_PAYOUT"
  | "PLATFORM_FEE";

type LedgerTx = {
  type: LedgerTxType;
  createdAt: Timestamp;

  amount: number;                 // positive or negative, in HUBBA_CREDIT units
  currency: "HUBBA_CREDIT";

  fromUid?: string;               // optional
  toUid?: string;                 // optional

  bountyId?: string;
  claimId?: string;

  memo?: string;

  // integrity
  hash?: string;                  // optional v2
};
```

## 2) Storage paths (locked)

- Claim clip: `claims/{bountyId}/{claimId}.mp4`
- Claim thumb: `claims/{bountyId}/{claimId}.jpg`
- Optional AR template: `bounties/{bountyId}/ar/template.json`

## 3) Cloud Functions (authoritative workflows)

All money movement is server-only.

### 3.1 createBounty (callable)

#### Inputs

```json
{
  "spotId": "string",
  "trickDesc": "string",
  "rules": "string?",
  "rewardTotal": 0,
  "expiresAt": "string"
}
```

#### Checks

- Auth required.
- rewardTotal >= MIN_REWARD (set min like 500 credits/cents).
- User has enough wallet.hubbaCredit for a hold (or if you don’t have wallet yet, use Stripe later).
- Rate limit: SKATER tier max 3/month; PRO unlimited.

#### Writes

- Create bounty with status OPEN.
- Deduct funds into “hold”:
  - users/{uid}.wallet.hubbaCredit -= rewardTotal
  - Ledger: BOUNTY_POST_HOLD (negative from user, positive to platform escrow model if you want)

#### Result

```json
{ "bountyId": "string" }
```

### 3.2 submitClaim (callable)

#### Inputs

```json
{
  "bountyId": "string",
  "clipStoragePath": "string",
  "durationSeconds": 0,
  "filmerUid": "string?"
}
```

#### Checks

- Auth required.
- Bounty status must be OPEN and not expired.
- One claim per user per bounty (enforced server-side query).
- Daily cap per spot (optional) to reduce spam.
- If filmerUid present: cannot equal claimerUid.

#### Writes

- Create claim doc PENDING.
- If filmerUid provided: set filmer.confirmed=false and send FCM to filmer.

### 3.3 confirmFilmerTag (callable)

#### Inputs

```json
{ "bountyId": "string", "claimId": "string", "accept": true }
```

#### Rules

- Only filmerUid can call.
- If accept: set filmer.confirmed=true.
- If reject: remove filmer block.

### 3.4 castVote (callable)

#### Inputs

```json
{ "bountyId": "string", "claimId": "string", "vote": "APPROVE", "comment": "string?" }
```

#### Checks

- Auth required.
- Voter cannot be claimer.
- Voter must meet gating:
  - user.bountyStats.reputation >= 30 AND/OR user has profile + X sessions
- One vote per user per claim (voteId=voterUid).
- If claim not PENDING, block.

#### Writes

- Upsert vote doc.
- Transactionally update claim vote counters.
- If votes.total >= minVotes and ratio passes, mark claim APPROVED and lock bounty (see next).

### 3.5 creatorDecision (callable)

Allows bounty creator to approve/reject any claim.

#### Inputs

```json
{ "bountyId": "string", "claimId": "string", "decision": "APPROVE", "note": "string?" }
```

#### Rules

- Only bounty.creatorUid can call.
- If approved: set claim APPROVED and lock bounty.
- If rejected: claim REJECTED.

### 3.6 lockBountyOnApproval (internal helper)

When a claim becomes approved:

- Set bounty LOCKED, lockedAt=now, lockedReason="Claim approved".
- Prevent other claims from being approved.

### 3.7 payOutClaim (callable, admin or auto)

Triggered after claim approved + bounty locked.

#### Inputs

```json
{ "bountyId": "string", "claimId": "string" }
```

#### Checks

- Claim must be APPROVED, not paid.
- Bounty must be LOCKED.
- Prevent double pay via transaction and idempotency key.

#### Payout math (locked)

Let:

- R = bounty.rewardTotal
- F = platformFeeBps
- C = filmerCutBps

Compute:

- platformFee = floor(R * F / 10000)
- net = R - platformFee
- filmerAmount = filmer.confirmed ? floor(net * C / 10000) : 0
- claimerAmount = net - filmerAmount

#### Writes

- claim.payout = { platformFee, netReward: net, claimerAmount, filmerAmount, paidAt }
- Update wallets:
  - claimer.wallet += claimerAmount
  - filmer.wallet += filmerAmount if confirmed
  - platform fee stays in platform wallet or a system user
- Ledger entries:
  - PLATFORM_FEE (+platformFee)
  - CLAIM_PAYOUT (+claimerAmount to claimer)
  - CLAIM_PAYOUT (+filmerAmount to filmer if any)
- Set claim PAID
- Set bounty PAID

### 3.8 expireBounties (scheduled)

Runs every hour.

- If expiresAt < now and status in OPEN, set EXPIRED.
- Refund policy (locked for v1): 80% refund
  - refund = floor(R * 0.8)
- Keep 20% as “listing fee” or return 100% if you want goodwill. Pick one. (Codex said 80% refund.)
- Credit creator wallet with refund
- Ledger: BOUNTY_REFUND
- Set bounty CANCELLED or EXPIRED depending on refund.

## 4) Firestore Security Rules (v1 policy)

Principle: clients can read, but writes are restricted; sensitive state transitions go through Functions.

### Reads

- Anyone can read bounties and claims if spot is public.
- Votes can be readable or only aggregated (better: keep votes readable but minimal).

### Writes

- `/bounties/*` — no direct client writes.
- `/claims/*` — no direct client writes (except maybe adding clip metadata). Prefer none.
- `/votes/*` — no direct writes; voting via callable ensures gating and counter updates.

If you insist on direct vote writes, you must lock it hard. But callable-only is safer.

## 5) API / Client hooks (Next.js)

Use callable functions as your API. For TypeScript, define a shared contract:

### Client functions

- bounties.create({ spotId, trickDesc, rules, rewardTotal, expiresAt })
- bounties.claim({ bountyId, clipStoragePath, durationSeconds, filmerUid })
- bounties.vote({ bountyId, claimId, vote, comment })
- bounties.decide({ bountyId, claimId, decision, note })
- bounties.confirmFilmer({ bountyId, claimId, accept })
- bounties.payout({ bountyId, claimId }) (admin only or hidden)

## 6) UI Flow (routes + screens)

### Map / Spot Profile

Spot page shows Active Spot Bounties section.

CTA: Post Spot Bounty

Cards show: trick, reward, time left, claim count.

### Bounty Detail

Shows trick spec, rules, reward, time left.

Tabs:

- Claims (list, sorted by votes/time)
- Submit Claim (upload)
- Vote (inline on each claim)

### Submit Claim

- Upload clip to Storage, then call submitClaim.
- Optional: tag filmer by @handle.
- Show “filmer confirmation pending” badge if tagged.

### Voting

- Vote buttons: Approve / Reject
- Show current tallies.
- Disable vote if user gated out (explain: “Need more sessions / reputation”).

### Creator tools (only creator sees)

- Approve / Reject buttons on each claim.
- “Pay out” button (or automatic once approved).

### Notifications

FCM:

- filmer tag request
- claim approved
- bounty expired
- payout received

## 7) Abuse & Rate Limits (locked rules)

### Rate limits

- SKATER: 3 bounties/month
- CLAIMS: max 5 claims/day total (tune later)
- Votes: max 50/day (prevents brigading)

Enforced in Cloud Functions using:

- users/{uid}.bountyStats.monthlyBountyCount
- users/{uid}.bountyStats.lastBountyAt

Plus a lightweight per-day counter doc if needed.

### Reputation

- Start at 50.
- Claim approved: +5
- Claim rejected: -10
- Proven abuse: -25 and temp ban flag
- Voting access requires >= 30

Store:

- users/{uid}.bountyStats.reputation

### Multi-account detection (v1 light)

- Store deviceIdHash on session auth (if you have it).
- Flag suspicious patterns (same device voting/claiming).

## 8) Phase plan (build order)

### Phase 1 (ship fast)

- Create bounty (hold funds)
- Submit claim (clip upload)
- Voting + creator decision
- Payout in HubbaCredit ledger
- Expiry + refund job
- Basic rate limits + reputation

#### Phase 1 tasks (minimum set)

- createBounty callable
- submitClaim callable
- vote + counters
- payout + ledger
- expiry job

### Phase 2

- Filmer confirm + auto-split
- Stronger anti-abuse + audits
- Better admin tooling

### Phase 3

- AR template storage + manual alignment UI hooks
- AR scoring stored in claim.arValidation

### Phase 4

- Sponsor pools + branded bounties
- Event hunts

### Phase 5

- Optional crypto rails

## 9) Implementation notes (so it doesn’t break later)

- Pick one unit for money: either “credits” or “cents”. Use integers only.
- All counter updates must be transactional.
- All payout functions must be idempotent (same call twice does nothing).
- Never trust downloadUrl from client. Trust Storage path + metadata from server.

## 10) Deliverables checklist (copy into your backlog)

- Firestore: create collections + indexes (bounties by spotId/status/expiresAt)
- Storage: set rules so only claimer can upload to their claim path (or signed upload)
- Cloud Functions: createBounty, submitClaim, castVote, creatorDecision, confirmFilmerTag, payOutClaim, expireBounties
- Ledger + wallet logic
- UI screens: Spot -> Bounties list, Bounty detail, Submit claim, Vote UI
- Notifications: filmer tag + payout
- Abuse: rate limit + reputation gates
