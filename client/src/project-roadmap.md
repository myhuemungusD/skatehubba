# SkateHubba Development Tracker

**Owner:** Jason Hamilton
**Entity:** Design Mainline LLC
**Trademark SN:** 99356919
**Updated:** February 2026

---

## Current Focus: Phase 1 — Prove It (100 Real Sessions)

See [ROADMAP.md](../../ROADMAP.md) for the full strategy. Everything below serves one goal: **get 100 completed S.K.A.T.E. games by real skaters.**

---

## Core Systems Status

| System                            | Frontend | Backend | Status  |
| --------------------------------- | -------- | ------- | ------- |
| **Authentication (Firebase)**     | Done     | Done    | 🟩 Ship |
| **Spot Map (Leaflet)**            | Done     | Done    | 🟩 Ship |
| **Check-In System (Geo)**         | Done     | Done    | 🟩 Ship |
| **Game of S.K.A.T.E. (Async)**    | Done     | Done    | 🟩 Ship |
| **Video Upload (TrickMint)**      | Done     | Done    | 🟩 Ship |
| **Dispute Resolution**            | Done     | Done    | 🟩 Ship |
| **Leaderboard**                   | Done     | Done    | 🟩 Ship |
| **Real-Time Updates (Socket.io)** | Done     | Done    | 🟩 Ship |

---

## Phase 1 Work (In Progress)

| Task                                 | Frontend       | Backend        | Status                              |
| ------------------------------------ | -------------- | -------------- | ----------------------------------- |
| **Push Notifications (Turn Alerts)** | 🟥 Not Started | 🟨 In Progress | Blocker for retention               |
| **Rematch Button**                   | 🟥 Not Started | 🟥 Not Started | Low effort, high retention          |
| **Game Chat**                        | 🟥 Not Started | 🟥 Not Started | Engagement driver                   |
| **Onboarding Tutorial**              | 🟥 Not Started | N/A            | Critical for new user activation    |
| **Invite Link Sharing**              | 🟥 Not Started | 🟥 Not Started | Growth loop                         |
| **Check-In Streaks**                 | 🟥 Not Started | 🟥 Not Started | Map engagement                      |
| **Video Transcoding**                | N/A            | 🟥 Not Started | Phone video compat                  |
| **Funnel Analytics**                 | 🟥 Not Started | 🟥 Not Started | Can't improve what we don't measure |
| **Mobile Web Polish (PWA)**          | 🟥 Not Started | N/A            | Most users on phone                 |

---

## Parked (Not Phase 1)

These are built or partially built but not the current focus:

| Feature                        | Status     | Notes                                  |
| ------------------------------ | ---------- | -------------------------------------- |
| AR Mode / Hologram Replay      | 🟩 Built   | Cool, but not driving game completions |
| AI Skate Buddy (Beagle)        | 🟩 Built   | Nice-to-have, not core loop            |
| Hubba Shop / Stripe            | 🟨 Partial | Monetization is Phase 3                |
| Closet / Profile Customization | 🟨 Partial | Cosmetics after retention              |
| Live Streaming / Spectator     | 🟨 Partial | Phase 2 at earliest                    |
| Pro User Badges                | 🟨 Partial | Phase 2                                |

---

## Background Systems

| System           | Status  | Notes                     |
| ---------------- | ------- | ------------------------- |
| Firestore Schema | 🟩 Done | Consolidation in progress |
| Firebase Storage | 🟩 Done | Upload rules solid        |
| Cloud Functions  | 🟩 Done | Cleanup scheduled         |
| Auth Rules       | 🟩 Done | Write limits enforced     |
| CI/CD Pipeline   | 🟩 Done | 294 test files            |

---

## Geo-Secure Unlock Logic

- Function: `verifyUserAtSpot`
- Radius: ≤ 30m
- Access expires: 24 hrs
- Components: `ARCheckInButton.tsx`, `ARTrickViewer.tsx`
- State: `useSpotAccess.ts`

---

## Status Key

- 🟩 Done / Ship-ready
- 🟨 In Progress / Partial
- 🟥 Not Started
