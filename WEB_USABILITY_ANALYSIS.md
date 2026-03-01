# SkateHubba Web Usability Analysis

**Date:** 2026-03-01
**Scope:** Full-stack analysis of web version (`client/`, `server/`, routing, state management)
**Goal:** Identify what's preventing SkateHubba from being a real, functioning, user-friendly product

---

## Executive Summary

SkateHubba has strong technical foundations — React 18, TypeScript, PostgreSQL, real-time Socket.io, 99%+ test coverage — but **the web version has critical usability gaps that would prevent real skaters from completing core workflows**. The biggest issues aren't bugs; they're **disconnected features, dead-end navigation, and premature monetization that blocks the core value loop before users experience it**.

The app has three "deal-breaker" categories:

1. **Dead features in primary navigation** — the PLAY button goes to a "Coming Soon" page
2. **Paywall blocks contribution before value is demonstrated** — free users can't add spots
3. **Silent failures and missing feedback** — users don't know what went wrong or what to do next

---

## The 7 Blockers Keeping This From Being a Real Product

### 1. The Main Feature is a Dead End

**Severity: CRITICAL**

The primary navigation has 4 items on mobile: Home, Map, Ranks, Profile. But the desktop/expanded nav (`navItems.ts:15`) includes **PLAY → `/play`**, which renders a construction icon and "S.K.A.T.E. Coming Soon."

Meanwhile, a **fully functional** S.K.A.T.E. game system exists at `/skate-game` and `/remote-skate` (with hooks, video upload, turn management, judging, disputes — the works). But `/play` doesn't link to either of them. The routing in `AppRoutes.tsx:222-223` even maps `/game` and `/skate-game` to the same dead-end `DashboardPlayRoute`.

**What a real user experiences:**
1. Signs up excited to play S.K.A.T.E.
2. Clicks "PLAY" in navigation
3. Sees construction icon: "Coming Soon"
4. Leaves. Never comes back.

**The fix:** Either wire `/play` to the existing game system, or hide the nav item until it's ready. The game code is *there* — it just isn't connected.

**Files:**
- `client/src/pages/play.tsx` — dead-end page
- `client/src/components/navigation/navItems.ts:15` — nav item pointing to dead end
- `client/src/routes/AppRoutes.tsx:222-223` — legacy routes also dead
- `client/src/hooks/useSkateGame.ts` — functional game hook (unused from nav)
- `client/src/hooks/useRemoteSkateGame.ts` — functional remote game hook (unused from nav)

---

### 2. The Upgrade Wall Blocks Core Value Before Users Experience It

**Severity: CRITICAL**

Free users can browse the map and see spots. But when they try to **add a spot** — the most natural action for a skater who found a new ledge — they hit an immediate paywall (`UpgradePrompt.tsx`). $9.99 to unlock.

The upgrade dialog lists features including "S.K.A.T.E. games" — which don't work (see Blocker #1). Users are being asked to pay for features that are either broken or non-existent.

**What a real user experiences:**
1. Opens map, sees cool spots
2. Finds a spot IRL, wants to add it
3. Taps "Add Spot" — sees lock icon, "$9.99 Premium"
4. Sees "S.K.A.T.E. games" listed as premium perk
5. Pays $9.99
6. Clicks PLAY → "Coming Soon"
7. Feels scammed. Requests refund.

**The fix:** Let free users add at least 1-3 spots to experience the core loop. Gate volume, not access. Remove "S.K.A.T.E. games" from the upgrade dialog until it's live.

**Files:**
- `client/src/pages/map.tsx:202-208` — paywall check on Add Spot
- `client/src/components/UpgradePrompt.tsx:98` — lists non-functional S.K.A.T.E. as premium feature

---

### 3. The Home Page Doesn't Tell Users What to Do

**Severity: HIGH**

After sign-up and profile creation, users land on `/hub` (the Home tab). The home page (`pages/home.tsx`) shows:
- A hero section with "quick actions" (from static content)
- Stats strip: "Active Skaters: Growing", "Skate Spots Mapped: 50+", "SKATE Battles: Active"
- A feature grid
- Trust indicators

None of this tells a new user what to **do next**. There's no:
- "Find spots near you" CTA
- "Challenge a friend" flow
- First-time user onboarding
- Progress toward anything

The Hub has three tabs (Overview, Activity, Community), but "Activity" shows a feed that requires location, and "Community" loads a BoltsShowcase component that may be empty.

**What a real user experiences:**
1. Signs up, creates profile
2. Lands on home page
3. Sees marketing copy and static stats
4. "...now what?"
5. Might click Map. Might leave.

**The fix:** Replace the home page with an action-oriented dashboard: your check-in streak, nearby spots, pending game turns, friends' activity. The `/tutorial` page exists but isn't linked from anywhere.

**Files:**
- `client/src/pages/home.tsx` — marketing-style content, no CTAs for logged-in users
- `client/src/pages/hub.tsx` — tab container with lazy-loaded content
- `client/src/pages/tutorial.tsx` — exists but unreachable from navigation
- `client/src/content/home.ts` — static content definitions

---

### 4. Mobile Users Can't Log Out or Access Key Features

**Severity: HIGH**

The `DashboardLayout.tsx` has two completely different navigation patterns:
- **Desktop:** Left sidebar with Home, Map, Ranks, Profile + Admin link + Sign Out button at bottom
- **Mobile:** Bottom tab bar with Home, Map, Ranks, Profile. No Sign Out. No PLAY. No Admin.

On mobile (where most skaters are), there's no visible way to:
- Log out (must know to go to Settings inside Profile)
- Access the S.K.A.T.E. game (PLAY isn't in mobile bottom nav)
- Access admin panel (if admin)
- Access TrickMint or Tutorial (no nav links at all)

The mobile bottom nav only has 4 items (`DashboardLayout.tsx:13-18`) and the `navItems.ts` hook that includes PLAY and MERCH is used elsewhere but not in DashboardLayout.

**What a real user experiences (mobile):**
1. Opens app on phone
2. Sees 4 tabs: Home, Map, Ranks, Profile
3. Can't find the game, can't find TrickMint, can't log out
4. "Where's the S.K.A.T.E. game they promised?"

**The fix:** Add a "More" overflow menu or 5th tab. Include logout in profile/settings. Make key features discoverable.

**Files:**
- `client/src/components/layout/DashboardLayout.tsx:13-18` — hardcoded 4-item mobile nav
- `client/src/components/layout/DashboardLayout.tsx:120-146` — mobile bottom nav render
- `client/src/components/navigation/navItems.ts` — includes PLAY/MERCH but unused in mobile layout

---

### 5. Check-In Flow Has Multiple Silent Failure Modes

**Severity: HIGH**

The check-in system (the core engagement loop per the roadmap) has several UX gaps:

**a) 30-meter radius is too strict for GPS accuracy**
- `lib/distance.ts` uses 30m as the "here" threshold
- GPS accuracy on phones can vary 5-50+ meters, especially in urban areas near buildings (where most skate spots are)
- Users physically AT a spot get told they're not close enough

**b) Geolocation timeout is too short and retries are immediate**
- `useGeolocation.ts` uses a 10-second timeout with `enableHighAccuracy: true`
- On error, it retries immediately without backoff — hammering the GPS and draining battery
- In poor conditions (indoors, urban canyons), 10 seconds isn't enough
- No progress indicator during retry attempts

**c) Error messages don't explain what happened**
- "Failed to verify your location" — was I too far? Bad GPS? Network error?
- No "Try Again" button in error states — just a toast that disappears
- Browse mode notification shows once and never again (`hasShownBrowseToastRef`)

**d) Demo spots fallback is deceptive**
- When the API fails, `map.tsx:123-129` silently shows `DEMO_SPOTS` with message "Showing iconic spots worldwide"
- Users might try to check in to demo spots (which are read-only)
- No indication these aren't real community-contributed spots

**What a real user experiences:**
1. Stands at a skate spot
2. Opens map, sees the spot marker
3. Tries to check in
4. "Failed to verify your location" (GPS drift)
5. No retry button, toast disappears
6. "This app doesn't work"

**Files:**
- `client/src/lib/distance.ts:48` — 30m proximity threshold
- `client/src/hooks/useGeolocation.ts:83-95` — immediate retry without backoff
- `client/src/components/ARCheckInButton.tsx:119-125` — vague error messages
- `client/src/pages/map.tsx:123-129` — silent demo spot fallback

---

### 6. Real-Time Game State is Unreliable for Actual Play

**Severity: HIGH**

The S.K.A.T.E. game (when accessible) has state management issues that would break real gameplay:

**a) 10-second polling is too slow for turn-based play**
- `useSkateGameApi.ts` polls every 10 seconds. After an opponent submits a trick, the other player waits up to 10 seconds to see it. For a game, this feels broken.
- Background polling is disabled (`refetchIntervalInBackground: false`), so tabbing away means missing your opponent's move entirely.

**b) No connection status indicator**
- Users don't know if they're connected to Socket.io
- If disconnected, the leaderboard and game appear frozen with no explanation
- No "reconnecting..." UI

**c) Race conditions in video upload completion**
- `useRemoteSkateGame.ts` has no serialization between upload completion and round resolution
- If a user navigates away during upload, the round can hang indefinitely
- No rollback if video succeeds but metadata update fails

**d) No turn timer or opponent status**
- Can't see if opponent is online or AFK
- No turn deadline countdown visible in UI
- No "nudge" or reminder feature
- Forfeit has no confirmation dialog — accidental tap = game over

**Files:**
- `client/src/hooks/useSkateGameApi.ts:22-34` — 10s polling, no background refetch
- `client/src/hooks/useRemoteSkateGame.ts:213-226` — race condition in upload
- `client/src/lib/useSocket.ts:105-143` — token refresh race condition
- `client/src/hooks/useSkateGame.ts:62-66` — optimistic updates can diverge from server

---

### 7. Email Verification Creates an Annoying Gatekeeping Loop

**Severity: MEDIUM**

The `EmailVerificationBanner.tsx` appears on every page load for unverified users. It:
- Can't be permanently dismissed (reappears on every navigation/refresh)
- Has a resend cooldown but no countdown timer — the button just looks broken
- Doesn't suggest checking spam folders until after clicking resend
- Takes significant screen space on mobile (banner + top bar + bottom nav = ~30% of viewport is UI chrome)

Combined with the paywall, an unverified free user can:
- Browse the map (read-only)
- View the leaderboard
- See their empty profile
- ...nothing else.

There's no path to value without either verifying email (to contribute spots) AND paying $9.99 (to actually add spots). That's two gates before the user does anything meaningful.

**Files:**
- `client/src/components/EmailVerificationBanner.tsx:17-19` — resets on every load
- `client/src/components/layout/DashboardLayout.tsx:99,111` — banner rendered in both layouts

---

## Secondary Issues

### Navigation & Routing

| Issue | Impact | File |
|-------|--------|------|
| Tutorial page exists but no link to it | Users never discover onboarding | `routes/AppRoutes.tsx:228` |
| TrickMint page exists but no nav link | Feature is inaccessible | `routes/AppRoutes.tsx:227` |
| Demo page not linked from landing | Conversion funnel broken | `routes/AppRoutes.tsx:162` |
| `/spots/:id` has no back button | Deep-linked users are stranded | `routes/routeWrappers.tsx` |
| Two separate nav item systems exist | Mobile/desktop feature parity gap | `navItems.ts` vs `DashboardLayout.tsx` |

### Map & Spots

| Issue | Impact | File |
|-------|--------|------|
| 32px map markers (Apple minimum: 44px) | Mis-taps on mobile, especially with nearby spots | `SpotMap.tsx:70-85` |
| Spot photos limited to 3 but only 1 shown | Uploaded photos are invisible in detail view | `AddSpotModal.tsx:52`, `SpotDetailModal.tsx:205` |
| Filters don't persist across sessions | Users re-apply filters every visit | `map.tsx:401-420` |
| No multi-select for spot type filters | Can't show "ledge + rail" together | `map.tsx:409-419` |
| No "Clear all filters" button | Must manually reset each filter | `map.tsx` |

### Auth & Profile

| Issue | Impact | File |
|-------|--------|------|
| Profile setup redirect is silent | Users don't know why they're being redirected | `auth-guard.tsx` |
| `profileStatus: "unknown"` causes infinite loading | App gates on profile status but doesn't retry fetch | `authStore.ts:179-180` |
| Profile cache only stores status, not data | Server outage = forced re-setup | `authStore.utils.ts:109-114` |
| Session storage is tab-specific | New tab = profile status lost | `authStore.utils.ts:32` |

### Performance & Battery

| Issue | Impact | File |
|-------|--------|------|
| Continuous GPS tracking with high accuracy | Battery drain on map page | `map.tsx:84` |
| Map tiles not cached/precached | Mobile data usage on every pan/zoom | `SpotMap.tsx` |
| Socket connections stay open when backgrounded | Unnecessary battery/data usage | `useSocket.ts` |
| No offline mode or service worker caching | App appears broken without connectivity | `OfflineBanner.tsx` |

### Error Handling

| Issue | Impact | File |
|-------|--------|------|
| Most API errors show generic toast | Users don't know what went wrong | `ARCheckInButton.tsx:119-125` |
| No retry buttons on error screens | Must refresh entire page to retry | `LoadingScreen.tsx` |
| No network status indicator | Users don't know they're offline | App-wide |
| Spot API failure shows demo data without warning | Users interact with fake data | `map.tsx:123-129` |

### Accessibility

| Issue | Impact | File |
|-------|--------|------|
| Color-only proximity indicators | Colorblind users can't distinguish spot distance | `SpotMap.tsx` |
| Map markers lack text distance labels | Screen readers get no proximity info | `SpotMap.tsx` |
| Hub tab switching shows full-page spinner | Jarring transition, no skeleton loaders | `hub.tsx:67` |
| Keyboard users can get trapped in Leaflet map | No escape mechanism documented | `SpotMap.tsx` |

---

## What Needs to Happen (Priority Order)

### Must Fix Before Real Users (Week 1)

1. **Connect `/play` to the actual game system or hide the nav item.** The game code exists — wire it up or remove the tease.

2. **Let free users add spots (even just 1-3).** The spot contribution loop is the community flywheel. Gating it behind $9.99 before users experience value kills growth.

3. **Remove "S.K.A.T.E. games" from the upgrade prompt** until the game is accessible from navigation.

4. **Add logout to mobile layout.** Users can't sign out on their phones.

5. **Replace the post-login home page with an action dashboard.** Show: nearby spots, check-in streak, pending game turns, "add your first spot" CTA.

### Should Fix Before Launch (Week 2-3)

6. **Increase check-in radius to 50m** or use dynamic radius based on GPS accuracy (`Math.max(50, accuracy * 1.5)`).

7. **Add geolocation retry with exponential backoff** (2s, 4s, 8s) and progress feedback.

8. **Add connection status indicator** (green dot = connected, yellow = reconnecting, red = offline).

9. **Make TrickMint and Tutorial discoverable** — add to navigation or hub quick actions.

10. **Show all uploaded spot photos** in detail view (carousel/gallery).

### Should Fix Before Scale (Month 1)

11. **Reduce game polling to 2-3 seconds** or use WebSocket push for turn updates.

12. **Add turn timer and opponent online status** to game UI.

13. **Add forfeit confirmation dialog** to prevent accidental game loss.

14. **Persist map filters** to localStorage.

15. **Add specific error messages** with recovery actions ("You're 45m away — move closer" vs "Failed to verify location").

16. **Add onboarding tutorial** linked from first login and hub page.

---

## The Core Problem

SkateHubba has built impressive infrastructure — real-time sockets, video pipelines, geo-verification, async game state machines, 99%+ test coverage. But the **user-facing layer doesn't connect the dots**. The game exists but isn't reachable. The map works but blocks contributions. The home page sells instead of guiding.

The roadmap says "prove it with 100 completed S.K.A.T.E. games." That can't happen when the PLAY button goes to "Coming Soon."

**Fix the wiring, not the engine.** The engine is solid.
