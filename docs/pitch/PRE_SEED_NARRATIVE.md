# SkateHubba — Pre-Seed Narrative

## Elevator Pitch (3 sentences)

SkateHubba is the skater-native app that turns progression into a daily loop: scroll real clips in a vertical feed, battle remotely in Game of S.K.A.T.E. with community judging, and check into spots for streaks, crews, and city leaderboards.

We're building the skate graph—tricks, spots, reputation, judging outcomes, and crew influence—creating a network effect brands, media, and studios can't replicate overnight.

AR time-capsules unlock as the reward layer: persistent ghosts and replays at legendary spots drive IRL FOMO, powered by vendor-agnostic spatial anchoring platforms (Niantic's VPS alone cites one million production VPS locations).

---

## Why Now

- **Phone cameras crossed the threshold.** 4K and slow-motion are standard on mid-range phones — every skater already carries a broadcast-quality camera in their pocket
- **Skate culture already lives online.** IG Reels, TikTok, and YouTube Shorts proved skaters will film, edit, and share daily — but none of these platforms offer structured competition or progression
- **Post-Olympics momentum.** Skateboarding's debut at Tokyo 2020 and return at Paris 2024 expanded the global audience and legitimized competitive skating for a new generation
- **No incumbent owns the competition layer.** Spot-finder apps (Shred Spots, Skatepark Project) solve discovery. Media apps (Berrics, Braille) solve content. Nobody has built the async gameplay + identity layer that ties them together
- **Creator-economy infrastructure is mature.** Stripe, Firebase, Expo, Vercel, and Neon mean a small team can ship production-grade platforms that previously required 20+ engineers

---

## Market (Credible, Conservative, Current)

- **Global skateboard market:** $3.56B (2024) → $4.63B (2033) at 2.6% CAGR (2025–2033)
- **Why it matters:** Durable spend and culture. The upside is the untapped social + gaming overlay (UGC, competition, identity, and local discovery)
- **Gaming context:** Newzoo's 2025 forecast puts the global games market around $188.9B

---

## AR Positioning (Future-Proof, Not Vendor-Tied)

**What we say in the pitch:**

> AR is a capability layer, not the company. The moat is the skate graph, not the AR plumbing.

- **Early:** 2D replays + "ghost" overlays + lightweight WebAR fallback
- **Mid/late:** Upgrade top "legendary" spots to persistent anchors where coverage exists

**Verified infrastructure signal:**

- Niantic states VPS has one million VPS locations in full production

**Vendor risk (and why we're safe):**

- 8th Wall says Niantic Spatial services (including VPS/Maps) are being decoupled and are not included in the distributed engine binary for offline projects after the stated window—so we design for swap-in providers

---

## Trademark (Clean, Diligence-Ready)

- **Federal trademark filed:** USPTO Serial 99356919 (Classes 009 & 041)
- Receipt available for review: `USPTOreceipt-99356919`

---

## North Star Metric

**North Star: Weekly Active Battles per Active User (WAB/AU)**

This proves social density. Not passive scrolling.

- **Early target:** 0.5–1.0 WAB/AU (enough battles to create habit + invites)

### KPI Ladder (the proof stack)

| Metric                           | Target       |
| -------------------------------- | ------------ |
| % uploads with a response in 48h | 25–40%       |
| Votes per battle                 | 5+ average   |
| Crew join rate                   | 25%+ of WAUs |
| Share/export-driven sessions     | 20%+         |
| D7 retention                     | 12–18%       |

---

## 10-Slide Deck Outline

### 1) Problem

Skate progression is fragmented. Clips live on TikTok/IG, spots live in DMs, battles are hard to coordinate, and local scenes don't have a real identity layer.

**Proof:** 3–5 real quotes from local skaters + a simple "today's workflow" diagram

### 2) Solution

One loop: **Watch → Battle → Check-in → Crew → Share → Repeat**

**Proof:** Single loop diagram + 3 screenshots of the current product

### 3) Product (What exists + what's next)

- Vertical feed built around responses
- Remote S.K.A.T.E. battles with judging
- Spot check-ins, streaks, city boards
- Crews
- AR time-capsules as unlocks

**Proof:** 20–30 sec demo clip/GIF of battle flow + export

### 4) Traction / Proof-of-Loop

We're not pitching features. We're pitching a loop.

**Proof:** WAB/AU + response rate + D7 retention + share-driven signups (even small numbers + trend line wins)

### 5) Market

$3.56B → $4.63B skateboard market (Grand View). Plus: a massive social-gaming adjacency (global games market ~ $188.9B in 2025).

**Proof:** One clean chart + 3 drivers (youth, street culture/social media, parks/urban)

### 6) Moat / Defensibility

The skate graph: outcomes + judges + spots + crews + reputation. Hard to copy without community density.

**Proof:** Layered graph diagram (Clip Graph / Spot Graph / Rep Graph) + why each layer compounds

### 7) Go-To-Market (Low CAC)

Hyper-local first. Win one region, then repeat.

- SoCal "Founding Crews" launch
- Weekly rituals: battle bracket + spot challenge
- Built-in exports as the acquisition loop

**Proof:** City launch playbook + ambassador structure

### 8) Roadmap (Credible sequencing)

- **Phase 1:** Prove loop metrics
- **Phase 2:** Crews + challenges = habit
- **Phase 3:** Native mobile + AR unlocks
- **Scale:** Skate graph monetization + brand platform

**Proof:** Timeline with targets per phase (WAB/AU, response rate, D7)

### 9) Business Model (Skate-core, not ad-tech)

Monetize status, tools, and drops—not attention.

- Premium tools (matchmaking, analytics, creator tools)
- Sponsored challenges + drops
- Affiliate/commerce cut
- Ticketed contests/events + prizes

**Proof:** Conservative Y1 revenue band + expansion logic

### 10) Ask / Team

**Pre-seed ask ($250k–$1M range):** Ship native mobile, harden battles/judging, launch founding crews, and build moderation/anti-cheat.

**Team today:** Solo technical founder built v0.9.0 end-to-end — full-stack TypeScript monorepo, 294 test files at 99.5% coverage, A- security audit (44 findings remediated), CI/CD pipeline, Docker staging, Vercel production. This level of pre-seed engineering rigor is the proof of execution.

**Hiring plan:** Mobile/AR lead + Backend/infra + Community lead (part-time acceptable) + brand partnerships

**Proof:** Use-of-funds pie + hiring sequence + 90-day execution plan

---

## Technical Moat

Most pre-seed startups ship a prototype. SkateHubba shipped a production-grade platform:

- **294 test files** with 99.5% coverage thresholds enforced in CI
- **A- security audit** — 44 findings identified and remediated across three audit rounds
- **4 Architecture Decision Records** documenting database strategy, auth architecture, monorepo structure, and schema ownership
- **Full CI/CD pipeline** — GitHub Actions with lockfile integrity, secret scanning (Gitleaks + Secretlint + CodeQL), type checking, linting, coverage gates, bundle budgets, and migration drift detection
- **Production deployment** — Vercel (prod), Docker Compose (staging), Firebase Cloud Functions, automated SSL
- **66 documentation files** covering architecture, security, deployment, game rules, specs, and operational runbooks

This engineering foundation means the platform scales without a rewrite. Investors are funding growth, not technical debt paydown.

---

## Conservative Monetization Frame

| Year | Revenue         | Drivers                                                                                |
| ---- | --------------- | -------------------------------------------------------------------------------------- |
| Y1   | $150k–$350k     | Affiliate + local shop sponsors + early drops; premium starts once retention is proven |
| Y2   | $2M–$6M         | Premium + bigger drops + recurring sponsor programs                                    |
| Y3   | $10M+ potential | Scale cities + creator economy + contests + larger brand integrations                  |

---

## Closing Line

> SkateHubba becomes the identity and gameplay layer for skating: the place where clips turn into battles, battles turn into crews, crews turn into cities, and cities turn into a proprietary skate graph.

---

## Data Room Checklist

- [x] USPTO receipt (Serial 99356919)
- [ ] Product demo clip (20-30 sec battle flow) — *in progress*
- [ ] Analytics screenshots (WAB/AU, D7 retention) — *pending beta cohort*
- [x] Architecture diagram — see [System Architecture](../SYSTEM_ARCHITECTURE.md) and [Database Architecture](../DATABASE_ARCHITECTURE.md)
- [x] Security posture doc — see [Security Policy](../../SECURITY.md) and [Security Audit](../security/SECURITY_AUDIT.md)
- [ ] User quotes/testimonials — *pending beta launch*
- [x] Market research sources (Grand View, Newzoo) — cited in Market section above
- [x] Competitive landscape — see [Competitive Landscape](COMPETITIVE_LANDSCAPE.md)
- [x] Traction and milestones — see [Traction](TRACTION.md)
- [x] Executive summary — see [Executive Summary](EXECUTIVE_SUMMARY.md)

---

## Related Documents

- [Executive Summary](EXECUTIVE_SUMMARY.md) — one-page company overview
- [Competitive Landscape](COMPETITIVE_LANDSCAPE.md) — positioning vs alternatives
- [Traction & Milestones](TRACTION.md) — what we've built and where we are
- [Roadmap](../../ROADMAP.md) — phased product plan with exit criteria
- [Security Policy](../../SECURITY.md) — security posture and audit history
- [System Architecture](../SYSTEM_ARCHITECTURE.md) — technical architecture overview
