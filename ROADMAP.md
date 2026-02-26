# SkateHubba Roadmap

This roadmap outlines planned features and improvements for SkateHubba. Our focus is on doubling down on what makes us different: **the S.K.A.T.E. game**.

---

## 🎯 Vision

**Make SkateHubba the premier platform for competitive skateboarding gameplay**, not just another spot map app.

While other apps (Shred Spots, The Spot Guide, Skately) focus on passive discovery, we're building the **first async turn-based video game for skateboarding**.

---

## Q1 2026 (Jan - Mar) - Mobile & Core Polish

> **Status:** In progress. See [Recently Completed](#recently-completed) for shipped items.

### 🎮 Game Improvements
- [ ] **Spectator Mode** - Watch live S.K.A.T.E. games in progress
- [ ] **Game Replays** - View full game history with all trick videos
- [ ] **Trick Difficulty Ratings** - Community voting on trick difficulty
- [ ] **Game Stats Dashboard** - Win/loss record, favorite tricks, completion rate
- [ ] **Rematch Functionality** - Quick challenge for rematches after game ends
- [ ] **Game Chat** - Trash talk and encouragement during games

### 📱 Mobile App (HIGH PRIORITY)
- [ ] **React Native UI Implementation**
  - [ ] S.K.A.T.E. game screens (lobby, recording, judging)
  - [ ] Map and spot browsing
  - [ ] Check-ins with native geolocation
  - [ ] Leaderboard
  - [ ] User profiles
  - [ ] Activity feed
- [ ] **Native Video Recording** - Use device camera for trick captures
- [ ] **Push Notifications** - Real-time alerts for turn completions
- [ ] **Offline Mode** - Cache game state for areas with poor connectivity
- [ ] **App Store Submission** (iOS + Android)

### 🔧 Infrastructure
- [ ] **Video Transcoding Pipeline** - Automatic compression and format conversion
- [ ] **Thumbnail Extraction** - Generate video thumbnails for all tricks
- [ ] **CDN Integration** - Faster video delivery worldwide
- [ ] **Load Testing** - Benchmark performance at 10k+ concurrent users
- [ ] **Performance Monitoring** - Real-time dashboards for uptime/errors

### 🗄️ Database Consolidation — Phase 1 (Cleanup)
- [ ] **Remove legacy Firestore collections** - Drop rules for `signups`, `mail`, `mailList`, `subscriptions`
- [ ] **Deprecate Firestore `gameSessions`** - PostgreSQL `game_sessions` table is the replacement
- [ ] **Unify `challenges` table** - Extend PostgreSQL schema for Remote S.K.A.T.E. challenges with write-through to Firestore
- See [DATABASE_CONSOLIDATION_PLAN.md](docs/DATABASE_CONSOLIDATION_PLAN.md)

### 📚 Documentation
- [ ] **OpenAPI/Swagger Schema** - Auto-generated API docs
- [ ] **Game Tutorial** - Interactive walkthrough for new players
- [ ] **Video Demos** - Record full S.K.A.T.E. game for marketing

---

## Q2 2026 (Apr - Jun) - Competitive Features

### 🏆 Tournament Mode
- [ ] **Bracket-Style Tournaments** - 8, 16, 32, or 64 player competitions
- [ ] **Tournament Lobbies** - Public and private tournament creation
- [ ] **Prize Pools** - Entry fees and winner payouts via Stripe
- [ ] **Tournament Brackets UI** - Live bracket visualization
- [ ] **Admin Tournament Tools** - Manage disputes and disqualifications
- [ ] **Leaderboard Integration** - Tournament wins contribute to global rank

### 🤖 Trick Recognition AI
- [ ] **Automatic Trick Identification** - ML model recognizes tricks from video
- [ ] **Confidence Scoring** - AI suggests LAND/BAIL judgement
- [ ] **Training Dataset** - Collect 10k+ labeled trick videos
- [ ] **Model Fine-Tuning** - Improve accuracy based on user corrections
- [ ] **Trick Taxonomy** - Comprehensive database of skateboarding tricks

### 👥 Social Expansion
- [ ] **Crew/Team System** - Form crews with friends
- [ ] **Crew vs. Crew Battles** - 3v3 or 5v5 team S.K.A.T.E.
- [ ] **Crew Leaderboards** - Team rankings and stats
- [ ] **Social Sharing** - Share trick clips to Instagram/TikTok/Twitter
- [ ] **Highlight Reels** - Auto-generate montages from game clips

### 🗄️ Database Consolidation — Phase 2 (Game Unification)
- [ ] **Create PostgreSQL tables for Remote S.K.A.T.E.** - `remote_skate_games`, `remote_skate_rounds`, `remote_skate_videos`
- [ ] **Implement write-through** - Server writes to PostgreSQL first, projects to Firestore for real-time
- [ ] **Backfill existing Firestore game data** - One-time migration of all Remote S.K.A.T.E. history to PostgreSQL
- [ ] **Unified cross-mode leaderboards** - Single SQL query across both game modes
- See [DATABASE_CONSOLIDATION_PLAN.md](docs/DATABASE_CONSOLIDATION_PLAN.md)

---

## Q3 2026 (Jul - Sep) - Monetization & Growth

### 💰 Premium Features
- [ ] **Premium Tier** - Ad-free, unlimited games, priority support
- [ ] **Pro Tier** - Advanced analytics, verified badge, tournament access
- [ ] **Sponsor Integration** - Brand partnerships and sponsored tournaments
- [ ] **Custom Trick Challenges** - Brands set trick bounties for rewards

### 📊 Analytics & Insights
- [ ] **Player Analytics Dashboard** - Personal stats, improvement tracking
- [ ] **Trick Success Rates** - Which tricks you land most/least
- [ ] **Head-to-Head Records** - Stats against specific opponents
- [ ] **Meta Analysis** - Which tricks are most effective in S.K.A.T.E.

### 🗄️ Database Consolidation — Phase 3 (Commerce)
- [ ] **Migrate commerce to PostgreSQL** - Products, orders, holds move from Firestore to PostgreSQL
- [ ] **Replace sharded Firestore counters** - PostgreSQL `FOR UPDATE` locks for stock management
- [ ] **Move Cloud Functions commerce logic to Express** - `holdAndCreatePaymentIntent` becomes an Express route
- [ ] **Decommission Firestore commerce collections** - Remove `products`, `holds`, `orders` from Firestore
- See [DATABASE_CONSOLIDATION_PLAN.md](docs/DATABASE_CONSOLIDATION_PLAN.md)

### 🎨 Customization
- [ ] **Profile Themes** - Customize profile appearance
- [ ] **Custom Emojis/Reactions** - React to opponent's tricks in-game
- [ ] **Victory Animations** - Celebrate wins with custom animations
- [ ] **Trick Name Tags** - Label your signature tricks

---

## Q4 2026 (Oct - Dec) - Advanced Gameplay

### 🎮 New Game Modes
- [ ] **Speed S.K.A.T.E.** - Rapid-fire version with 10-second turn limits
- [ ] **Tag Team S.K.A.T.E.** - 2v2 where players alternate turns
- [ ] **King of the Park** - Winner-stays-on tournament mode
- [ ] **Trick Roulette** - Random trick assignments for chaos mode
- [ ] **Add-On** - Alternative game where each player adds to previous trick

### 🌍 Global Expansion
- [ ] **Multi-Language Support** - Spanish, Portuguese, Japanese, French
- [ ] **Regional Leaderboards** - Country/state/city rankings
- [ ] **Time Zone Optimization** - Smart scheduling for international games
- [ ] **Localized Content** - Region-specific spots and events

### 🏅 Events & Competitions
- [ ] **Seasonal Championships** - Quarterly mega-tournaments with prizes
- [ ] **Pro Challenges** - Sponsored pros challenge the community
- [ ] **Street League Integration** - Official SLS partnership (aspirational)
- [ ] **Live Event Coverage** - Stream tournaments with commentary

---

## 2027 & Beyond - Long-Term Vision

### 🚀 Ambitious Ideas

#### Augmented Reality (AR)
- AR trick validation using phone camera
- Ghost skater overlay showing opponent's trick
- AR spot visualization (see tricks overlaid on real-world spots)

#### Virtual Reality (VR)
- First-person VR S.K.A.T.E. experience
- Skate simulator for trick practice
- VR spectator mode for tournaments

#### Blockchain/NFTs (If Still Relevant)
- Mint legendary game moments as NFTs
- Collectible trick cards with rarity tiers
- Decentralized tournament prize pools

#### Advanced AI
- AI opponent for solo practice games
- Trick difficulty auto-adjustment based on skill level
- Personalized trick recommendations based on style

#### Physical Integration
- Smart sensors for real skateboard telemetry
- Automatic trick recording via wearable camera
- Pop height, flip speed, and landing impact metrics

#### Esports
- Official SkateHubba Pro League
- Sponsorship deals for top players
- Televised/streamed championship events
- Million-dollar prize pools

---

## Feature Requests & Community Input

We prioritize features based on:
1. **Alignment with core mission** (competitive skateboarding gameplay)
2. **User demand** (votes and feedback)
3. **Technical feasibility** (time and resources)
4. **Business impact** (user growth and retention)

### How to Request Features
1. Open a GitHub Issue with `[Feature Request]` tag
2. Describe the feature and use case
3. Explain how it enhances the S.K.A.T.E. game experience
4. Community votes via 👍 reactions

### Most Requested Features (TBD)
- [ ] _To be populated based on community feedback_

---

## Release Cycle

- **Major Releases (X.0.0):** Quarterly - New game modes, major features
- **Minor Releases (0.X.0):** Monthly - Feature improvements, new content
- **Patch Releases (0.0.X):** Weekly - Bug fixes, performance tweaks

---

## Success Metrics

We track progress against these KPIs:

### Q1 2026 Targets
- [ ] 1,000 registered users
- [ ] 100 active S.K.A.T.E. games per day
- [ ] 500 tricks uploaded per week
- [ ] Mobile app live in App Store & Google Play
- [ ] <2% game abandonment rate

### Q2 2026 Targets
- [ ] 10,000 registered users
- [ ] 1,000 active games per day
- [ ] First tournament with 100+ participants
- [ ] 5,000 monthly active users (MAU)
- [ ] <1% dispute rate on judgements

### Q4 2026 Targets
- [ ] 100,000 registered users
- [ ] 10,000 active games per day
- [ ] Profitable via premium subscriptions
- [ ] Featured in App Store "Apps We Love"
- [ ] Partnership with major skateboard brand

---

## Recently Completed

### February 2026
- ✅ Async turn-based S.K.A.T.E. game fully implemented
- ✅ Video recording and upload system (TrickMint)
- ✅ Dispute resolution workflow
- ✅ Real-time game updates via Socket.io
- ✅ Comprehensive CI/CD pipeline
- ✅ Security audit and multi-layer secret scanning
- ✅ 294 test files with coverage reporting

---

## Contribute

Want to help build these features? See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

**Join the revolution in competitive skateboarding. Let's build the future of the sport together.**

---

## Links

- [Changelog](CHANGELOG.md) - What's been built
- [Game Rules](docs/GAME_RULES.md) - How S.K.A.T.E. works
- [Contributing](CONTRIBUTING.md) - Development workflow
- [Security](docs/security/SECURITY.md) - Report vulnerabilities
