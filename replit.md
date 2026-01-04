# SkateHubba - Mobile Skateboarding Platform

## Governance Rule: Core progression semantics are immutable post-Phase 3. Changes require a new major version or explicit design review.

## Phase 4 Backend Exception (Explicit & Limited)
Phase 4 permits one (1) read-only backend aggregation endpoint to support public discovery features.

**Approved Endpoint:**
`/api/social/bolts-showcase`

**Constraints:**
- Read-only
- No schema changes
- No writes or background jobs
- No pagination, filters, ranking tiers, or time windows

This endpoint is **FROZEN** for Phase 4. Any modification or additional aggregation endpoints require Phase 5 approval.

## Overview
SkateHubba is a multi-platform skateboarding ecosystem designed for production, featuring a React Native mobile app, a React web app, an Express.js backend, and Firebase Cloud Functions. It offers unique features like Remote S.K.A.T.E. challenges, AR check-ins with geo-verification, trick collectibles, an AI chat assistant, leaderboards, and e-commerce capabilities. The project aims to create a comprehensive digital hub for skateboarders, fostering community and engagement.

## User Preferences
Preferred communication style: Simple, everyday language.

## Development Setup

### Package Management (IMPORTANT)
This is a **pnpm monorepo**. Always use `pnpm` instead of `npm`:

```bash
# Quick start - bootstrap all dependencies
./scripts/bootstrap.sh

# Or manually:
pnpm i --frozen-lockfile              # Root dependencies
cd mobile && pnpm i --frozen-lockfile # Mobile app
```

**⚠️ Never use `npm ci` or `npm install`** - this creates conflicting lockfiles.

### Local Fonts
Fonts are loaded locally from `/client/public/fonts/` with CDN fallback to prevent network timeout build failures:
- `BebasNeue-Regular.woff2`
- `PermanentMarker-Regular.woff2`

## System Architecture

### UI/UX Decisions
- **Design Theme**: Dark-themed with an orange accent, reflecting skateboarding culture.
- **UI Framework**: Tailwind CSS with shadcn/ui and Radix UI for accessible and customizable components.
- **WCAG AA Compliance**: 
  - **Color Contrast**: Success green changed from `#24d52b` (2.8:1 - FAILS) to `#00ff41` Baker green (7+:1 - PASSES)
  - **Design Tokens**: Implemented semantic success tokens (`bg-success`, `text-success`, `hover:bg-success-hover`)
  - **Coverage**: All brand/success surfaces updated across 30+ components/pages (0 legacy greens remain)
  - **Focus Indicators**: Orange (#f97316) 3px solid outlines with 2px offset for keyboard navigation
  - **Screen Reader Support**: Proper ARIA labels and semantic HTML structure
  - **Reduced Motion**: Respects `prefers-reduced-motion` for accessibility
  - **High Contrast**: Supports `prefers-contrast: high` mode
- **Polish & Accessibility**: Professional-level polish including smooth transitions, loading skeletons, micro-interactions, and a robust toast system.
- **Mobile & PWA**: Full PWA implementation with install prompts, mobile-responsive optimizations, and touch-friendly interactions.
- **Performance**: Code splitting, Suspense boundaries, lazy loading images, and performance monitoring.

### Phase Correction & Governance Lock (2026-01-04)
### Phase 3 COMPLETE — Progression Foundations Established
The core domain model for trick progression is now frozen and classified as foundational.

#### Hardening Pass (2026-01-04):
- **Spot Creation**: Implemented as a UI-only draft flow using mobile-first bottom sheets. Persistence and photo uploads are deferred to Phase 4.
- **Mobile UX**: Added dynamic viewport units (dvh) and safe-area inset support to prevent content clipping on notched devices.
- **Navigation**: Transitioned to a responsive hamburger menu for better scalability and mobile reach.

#### Frozen Foundations:
- **Mastery Levels**: 'learning' (default), 'consistent' (10+ lands), 'bolts' (10+ lands AND 5+ day streak).
- **Streak Timing**: 48-hour window (86,400,000ms * 2) required to maintain land streaks.
- **Progression State**: Transitions are server-enforced based on verified land counts and time-windows.
- **Validation**: Strict Zod schemas for all trick entry and mastery updates.

#### Phase Boundaries:
- **Phase 3 (CORE)**: Data correctness, Zod validation, Progression modeling, Cultural UX (“Bailed” error states).
- **Phase 4 (NEXT)**: Leaderboards, Social proof/sharing, Challenges, Rewards, Gamification layers. Phase 4 focus is amplification of existing foundations; no redesign of core mastery or streak semantics is permitted.

### Phase 4 COMPLETE — Identity & Amplification Foundations Established (2026-01-04)
Phase 4 focused on public identity, discovery, and brand amplification through strictly read-only features.
Deliverables include:
- Public trading-card profiles
- Identity resolution layer
- Trick mastery aggregation
- Curated Bolts Showcase

Phase 4 is now **CLOSED**. No additional features may be added under this phase.

#### Phase 4 Lock
- No new backend endpoints
- No new aggregation logic
- No social mechanics
- No competitive ranking systems
- Any work beyond visual polish or accessibility requires Phase 5 approval.

### Phase 5 — Social Mechanics (Planned, Not Started)
Phase 5 will introduce social interaction features (e.g., follows, leaderboards, challenges) under a new spec.
**Entry criteria:**
- Explicit Phase 5 spec approval
- New governance rules
- Clear separation from Phase 3 domain logic
No Phase 5 features may be implemented without an approved spec.

### System Status
- **Production-stable**: Core features verified
- **Governance-locked**: Immutability enforced
- **Phase 3 immutable**: Domain model frozen
- **Phase 4 complete**: Identity layer live
Ready for real-world usage and evaluation.

## Technical Implementations
- **Mobile App**: React Native with Expo SDK 51, expo-router, expo-camera, expo-location, and react-native-maps.
- **Web Frontend**: React 18 with TypeScript, Vite, Wouter for routing, TanStack React Query for state, and React Hook Form with Zod for forms.
- **Backend**: Node.js with TypeScript (ESM), Express.js for REST APIs, Drizzle ORM with Neon (serverless PostgreSQL), and connect-pg-simple for session storage.
- **Cloud Functions**: Firebase Cloud Functions v7 for Remote S.K.A.T.E. challenge system with deadlines and FCM push notifications.
- **Monorepo**: Shared code (`/shared/`) for types, schemas, and utilities across client, server, and mobile.
- **Authentication**: Firebase Authentication (email/password, phone, Google) integrated across web and mobile.
- **Data Architecture**: PostgreSQL for core data (users, spots, products), and Firestore for real-time features (challenges, chat, presence).
- **Tutorial System**: Dynamic onboarding with progress tracking and dedicated API endpoints.

### System Design Choices
- **Directory Structure** (Monorepo):
  - `/apps/` - Symlinks to app directories (Turbo-ready structure)
    - `/apps/web/` -> `/client/` - React web app
    - `/apps/server/` -> `/server/` - Express.js REST API
    - `/apps/mobile/` -> `/mobile/` - React Native Expo app
  - `/packages/` - Shared packages with typed exports
    - `/packages/types/` - Shared Zod types (UserProfile, etc.)
    - `/packages/api-sdk/` - Shared API client functions
    - `/packages/db/` - Drizzle schema exports
    - `/packages/firebase/` - Firebase configuration
    - `/packages/utils/` - Shared utility functions
  - `/specs/` - API and feature specifications
    - `checkin-endpoint.md`, `user-profile.md`, `auth-flow.md`
  - `/client/` - React web app (original location)
  - `/server/` - Express.js REST API (original location)
  - `/mobile/` - React Native Expo app (original location)
  - `/infra/firebase/functions/` - Firebase Cloud Functions
  - `/shared/` - Legacy shared types, schemas, and utilities
  - **Path Aliases**: `@skatehubba/types/*`, `@skatehubba/api-sdk/*`, etc.
- **API Architecture**: REST endpoints (`/api/*`) for Express, Cloud Functions (httpsCallable) for Remote S.K.A.T.E. challenges, and Firestore real-time listeners.
- **Client-Server Communication**: Custom fetch wrapper with TanStack React Query (web), apiRequest helper + Firebase callable functions (mobile), cookie-based sessions for web, and Firebase tokens for mobile.
- **Deployment**: Mobile via Expo EAS Build to app stores; Web as static files on Replit/Vercel; Backend on Replit with auto-scaling; Functions via Firebase Cloud Functions.

## External Dependencies

### Backend & Cloud
- **Database**: Replit PostgreSQL (production-ready)
- **Real-time**: Firebase Firestore
- **Cloud Functions**: Firebase Functions v7
- **Authentication**: Firebase Authentication
- **Storage**: Firebase Cloud Storage

### Web App
- **UI Libraries**: Radix UI, shadcn/ui, Tailwind CSS
- **State Management**: TanStack React Query, Zustand
- **Form Validation**: Zod, React Hook Form
- **Build Tools**: Vite, esbuild, tsx

### Mobile App
- **Framework**: Expo SDK 51, React Native
- **Navigation**: Expo Router
- **Camera**: expo-camera, expo-av
- **Location**: expo-location, react-native-maps
- **Theme System**: WCAG AA compliant design tokens with #00ff41 success color
- **Accessibility**: Full accessibilityRole, accessibilityLabel, and accessibilityState props on all interactive elements

### Shared
- **TypeScript**: For type safety
- **Date Handling**: date-fns
- **Linting**: ESLint, Prettier