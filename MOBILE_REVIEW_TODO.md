# Mobile Web Review & Todo List

> Review date: 2026-02-12
> Reviewer: Claude (Opus 4.6)
> Scope: Web client (`/client`) mobile responsiveness — the PWA experience users get on phones

---

## Status Summary

The mobile foundations are solid: dark-first design, bottom tab nav with safe area insets, rem-based typography, lazy-loaded routes, and a well-structured layout system. The main gaps are around touch target sizing, a few layout overflow issues, and missing mobile-native patterns (pull-to-refresh, swipe tabs, haptics). Below is the prioritized work to get this ready for real users on phones.

---

## Critical (Must Fix Before Launch)

- [ ] **Increase touch targets to 44px minimum across all interactive elements**
  - Buttons: change default from `h-10` (40px) to `h-11` (44px) in `components/ui/button.tsx`
  - Inputs: change default from `h-10` to `h-11` in `components/ui/input.tsx`
  - Badge filter pills on map page need `min-h-[44px]` or adequate padding
  - Delete clip button in TrickMint (`w-3.5 h-3.5` + `p-1` = ~22px) needs wrapping in a 44px tap zone
  - Password toggle icons in auth forms need larger hit areas
  - Files: `components/ui/button.tsx`, `components/ui/input.tsx`, `pages/trickmint.tsx`, `pages/auth/SignInTab.tsx`, `pages/auth/SignUpTab.tsx`

- [ ] **Fix NotificationBell dropdown overflow on small screens**
  - Current: `w-80` (320px) positioned `absolute right-0` — overflows on 375px and smaller phones
  - Fix: use `w-[calc(100vw-2rem)]` or `max-w-[calc(100vw-2rem)]` on mobile, keep `w-80` on desktop
  - File: `components/NotificationBell.tsx`

- [ ] **Remove zoom restriction from viewport meta tag**
  - Current: `maximum-scale=1, user-scalable=no` — violates WCAG 2.1 SC 1.4.4
  - Change to: `width=device-width, initial-scale=1.0` (the 16px body font already prevents iOS auto-zoom on inputs)
  - File: `client/index.html:5`

- [ ] **Fix Challenge Lobby pending items layout on mobile**
  - Current: `GameCard` + Accept/Decline buttons in horizontal flex — overflows on narrow screens
  - Fix: stack vertically on mobile — card full width, buttons below as `flex gap-2 w-full`
  - File: `pages/ChallengeLobby.tsx:139-165`

- [ ] **Make video modals fullscreen on mobile**
  - Current: `max-w-lg` padded modal — wastes screen space for 9:16 video
  - Fix: on mobile, render video edge-to-edge with only a close button overlay, no card wrapper
  - Files: `pages/skate-game.tsx:606-634`, `pages/trickmint.tsx:380-408`

---

## High Priority (Before Public Beta)

- [ ] **Add pull-to-refresh on key pages**
  - Hub (overview/activity/community tabs), Challenge Lobby, TrickMint feed, Leaderboard
  - React Query's `refetch` is already wired up — just needs a gesture trigger
  - Consider a lightweight library or custom touch handler with Framer Motion

- [ ] **Collapse or dismiss map floating header on scroll/interaction**
  - The header card (~200px) eats too much vertical space on small phones
  - Options: auto-collapse to just search bar after first interaction, or add a toggle chevron
  - File: `pages/map.tsx:376-429`

- [ ] **Replace raw User ID input with username search for challenges**
  - Current: plain text input asking for Firebase UID — no real user knows this
  - Fix: username autocomplete search that resolves to UID, or link from profile pages
  - File: `pages/ChallengeLobby.tsx:105-124`

- [ ] **Add content skeleton placeholders instead of generic spinner**
  - Game cards, clip grids, leaderboard rows, and feed items should have content-shaped skeletons
  - Prevents layout shift on slow mobile connections
  - Files: `pages/ChallengeLobby.tsx`, `pages/trickmint.tsx`, `pages/leaderboard.tsx`

- [ ] **Add forfeit confirmation dialog**
  - The forfeit button triggers immediately with no confirmation — risky on mobile where accidental taps happen
  - Use existing Radix AlertDialog component
  - File: `pages/skate-game.tsx:248-256`

---

## Medium Priority (Post-Beta Polish)

- [ ] **Add swipe gesture navigation between tabs**
  - Hub, Play, and Profile all use tabbed UIs without swipe support
  - Framer Motion (already a dependency) supports drag/swipe with `onDragEnd` velocity detection
  - Files: `pages/hub.tsx`, `pages/play.tsx`, `pages/me.tsx`

- [ ] **Add haptic feedback on high-stakes actions**
  - LAND/BAIL judging, record start/stop, challenge accept/decline, forfeit confirmation
  - Use `navigator.vibrate(50)` with feature detection (Android Chrome only, iOS ignores gracefully)
  - Files: `pages/skate-game.tsx`, `components/game/VideoRecorder.tsx`, `pages/ChallengeLobby.tsx`

- [ ] **Complete PWA manifest**
  - Add `orientation: "portrait"` to prevent landscape layout breaks
  - Add `screenshots` array (at least 2 mobile screenshots) for better install prompt
  - Add `categories: ["sports", "social"]`
  - File: `client/public/manifest.json`

- [ ] **Add offline fallback page in service worker**
  - Cache a branded offline page on SW install
  - Return it for navigation requests when network is unavailable
  - File: `client/public/service-worker.js`

- [ ] **Reduce FeatureGrid gap on mobile**
  - Current: `gap-8` (32px) at all sizes — too much whitespace on phones
  - Fix: `gap-4 md:gap-8`
  - File: `sections/landing/FeatureGrid.tsx`

- [ ] **Make TrickMint clip grid responsive below 360px**
  - Current: fixed `grid-cols-2` — each card is ~148px on 320px phones, metadata truncates hard
  - Fix: `grid-cols-1 min-[360px]:grid-cols-2`
  - File: `pages/trickmint.tsx:426`

---

## Low Priority (Nice to Have)

- [ ] **Fix hero section gradient orb overflow**
  - Positioned at `-left-48 -right-48` — may cause horizontal scroll bounce on some mobile browsers
  - Fix: wrap in `overflow-hidden` container
  - File: `sections/landing/HeroSection.tsx`

- [ ] **Add progressive image loading for video thumbnails**
  - On slow 3G, large thumbnails in TrickMint feed load with a jarring pop-in
  - Use blur-up placeholder or native `loading="lazy"` with aspect-ratio containers (partly done)

- [ ] **Add "back to top" affordance on long-scrolling pages**
  - Feed, leaderboard, and check-in history can grow long
  - Floating button that appears after scrolling past 2 screens

- [ ] **Increase password toggle touch area in auth forms**
  - Icon is `h-4 w-4` with minimal padding — hard to tap accurately
  - Wrap in a 44px invisible hit area
  - Files: `pages/auth/SignInTab.tsx`, `pages/auth/SignUpTab.tsx`

---

## What's Already Good (Don't Break These)

- Bottom tab nav with safe area insets and 64px min-width per tab
- `useIsMobile()` hook with 768px breakpoint + `matchMedia` listener
- Mobile-specific short tab labels on Play and Profile pages
- 9:16 VideoRecorder with rear camera default and `playsInline`
- `max-w-md` content constraint on mobile layout
- Lazy-loaded tab content with Suspense boundaries
- `env(safe-area-inset-*)` usage for notch devices
- `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent`
- `prefers-reduced-motion` and `prefers-contrast: high` media queries
- Responsive `<picture>` elements in BackgroundCarousel with mobile-optimized srcsets
