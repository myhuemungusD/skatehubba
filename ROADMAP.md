# SkateHubba Roadmap

**Philosophy:** Find product-market fit first. Nail one thing, prove it works with real skaters, then expand. No feature factory.

---

## What We've Shipped (Feb 2026)

- Async turn-based S.K.A.T.E. game (video proof, no honor system)
- Video recording and upload (TrickMint)
- Dispute resolution workflow
- Real-time game updates via Socket.io
- Spot map with geo-verified check-ins (30m radius)
- Leaderboards
- CI/CD pipeline, security audit, 294 test files

**The core loop exists.** Now we need to prove people want it.

---

## Phase 1: Prove It (NOW → 100 Real Sessions Logged)

> One goal: get 100 complete, real S.K.A.T.E. games played by real skaters. Not signups. Not downloads. **Completed games.**

### Core Loop — Async Battles
- [ ] Fix any friction that causes game abandonment (track where players drop off)
- [ ] Push notifications for turn alerts (your opponent landed — your turn)
- [ ] Rematch button (zero-friction replay after game ends)
- [ ] Game chat (trash talk keeps people engaged)
- [ ] Onboarding flow — 60-second tutorial that gets a new player into their first game

### Core Loop — Map Check-Ins
- [ ] Make check-ins feel rewarding (streak tracking, spot "regulars" list)
- [ ] Surface nearby active games at checked-in spots
- [ ] "Challenge someone here" flow from the spot page

### Get It in Hands
- [ ] Mobile web optimization (most skaters are on phones, PWA before native)
- [ ] Invite link sharing (challenge a friend via text/IG DM with one tap)
- [ ] Basic video transcoding (uploads need to not choke on phone videos)

### Measure Everything
- [ ] Funnel tracking: signup → first game started → first game completed → second game
- [ ] Game abandonment rate by stage (challenge sent, trick recorded, judging, etc.)
- [ ] Session-to-return rate (did they come back within 7 days?)
- [ ] Weekly active players (not registered users — players who completed a game)

### Success Criteria (Exit Phase 1)
- 100 completed S.K.A.T.E. games by real users (not team/friends)
- Game completion rate >70% (games started vs. games finished)
- 30%+ of players play a second game within 7 days
- Net Promoter Score survey: "Would you tell a skater friend about this?"

---

## Phase 2: Retain (After 100 Sessions)

Only unlock this after Phase 1 metrics are hit. Focus: make players come back.

- [ ] Game stats dashboard (win/loss, trick accuracy, rival history)
- [ ] Game replays (shareable highlight of a full match)
- [ ] Spectator mode (watch friends play)
- [ ] Native mobile app (React Native — only if mobile web proves demand)
- [ ] Regional leaderboards (city/state competition)

### Success Criteria (Exit Phase 2)
- 50+ weekly active players
- 40%+ 30-day retention
- Organic invites: >20% of new users come from existing user shares

---

## Phase 3: Grow (After Retention Proven)

Only unlock this after Phase 2 metrics are hit. The order here is flexible — let data decide.

- [ ] Tournament mode (brackets, lobbies)
- [ ] Crew/team system (crew vs. crew battles)
- [ ] Social sharing (auto-clip to IG/TikTok)
- [ ] Premium tier (ad-free, unlimited games, analytics)

---

## Icebox (Cool Ideas, Not Now)

These are parked. They're distractions until PMF is proven:

- AI trick recognition
- AR/VR features
- Blockchain/NFTs
- Speed S.K.A.T.E. / new game modes
- Multi-language / global expansion
- Esports / pro league
- Smart sensors / wearables
- Brand sponsorships / partnerships
- Custom trick challenges / bounties
- Profile themes / cosmetics

**Revisit the icebox quarterly.** If a Phase 1 user literally asks for one of these, pay attention. Otherwise, ignore.

---

## Database Consolidation

This runs in parallel with product work — it's tech debt, not features.

- [ ] Remove legacy Firestore collections (`signups`, `mail`, `mailList`, `subscriptions`)
- [ ] Deprecate Firestore `gameSessions` (PostgreSQL `game_sessions` is the replacement)
- [ ] Unify challenges table in PostgreSQL with Firestore write-through
- See [DATABASE_CONSOLIDATION_PLAN.md](docs/DATABASE_CONSOLIDATION_PLAN.md)

---

## How We Decide What to Build

1. **Does it help us hit the current phase's exit criteria?** If no, it waits.
2. **Is a real user asking for it?** Signal > opinion.
3. **What's the smallest thing we can ship to learn?** Bias toward small bets.

---

## Feature Requests

Open a GitHub Issue with `[Feature Request]` tag. Community votes via thumbs-up. But we only build what the current phase demands.

---

## Links

- [Changelog](CHANGELOG.md)
- [Game Rules](docs/GAME_RULES.md)
- [Contributing](CONTRIBUTING.md)
- [Security](docs/security/SECURITY.md)
