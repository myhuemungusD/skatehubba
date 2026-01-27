# SkateHubba MVP Specification

**Version**: 1.0
**Surface**: Web (Primary)
**Last Updated**: 2026-01-26

---

## MVP Overview

This document outlines the Minimum Viable Product (MVP) implementation for SkateHubba - an end-to-end working demo suitable for investor presentation.

### Primary Demo Surface
**Web MVP** - Chosen for faster iteration, easy demo anywhere, and minimal app store friction.

---

## MVP Features (Implemented)

### 1. Email Sign Up + Sign In + Password Reset

| Feature | Route | Status |
|---------|-------|--------|
| Email sign up | `/signup` | Implemented |
| Email sign in | `/signin` | Implemented |
| Password reset | `/forgot-password` | Implemented |
| Profile setup | `/profile/setup` | Implemented |

**Implementation Details:**
- Firebase Authentication with email/password provider
- Automatic email verification sent on signup
- Password reset via Firebase `sendPasswordResetEmail`
- Profile creation with unique username validation

### 2. Email Verification

| Feature | Status |
|---------|--------|
| Verification email on signup | Implemented |
| Verification banner for unverified users | Implemented |
| Action restrictions for unverified users | Implemented |

**Implementation Details:**
- `EmailVerificationBanner` component shows in AppShell for unverified users
- Unverified users cannot create spots (must verify first)
- Resend verification email with 60-second cooldown
- Uses `useEmailVerification` hook for state management

### 3. User Profile Creation

| Feature | Status |
|---------|--------|
| Username (required) | Implemented |
| Stance (optional) | Implemented |
| Experience level (optional) | Implemented |
| Username uniqueness | Implemented |

**Implementation Details:**
- Username validation: 3-20 characters, alphanumeric
- Real-time availability check with debouncing
- Username reservation via API transaction

### 4. Map + Spots

| Feature | Status |
|---------|--------|
| Map loads spots from database | Implemented |
| Spot markers with clustering | Implemented |
| Add Spot functionality | Implemented |
| Spot filtering by type | Implemented |
| Geolocation support | Implemented |

**Implementation Details:**
- Leaflet + React Leaflet for map rendering
- PostgreSQL database with proper indexes
- Real-time geolocation with accuracy tracking
- Distance calculations and proximity detection

### 5. Add Spot (Verified Users Only)

| Feature | Status |
|---------|--------|
| Drop pin / auto-locate | Implemented |
| Name (required) | Implemented |
| Type (enum) | Implemented |
| Spot appears immediately | Implemented |

**Spot Data Model:**
```typescript
{
  name: string;           // Required, 1-100 chars
  lat: number;            // Required, -90 to 90
  lng: number;            // Required, -180 to 180
  spotType: enum;         // street, park, bowl, etc.
  tier: enum;             // bronze, silver, gold, legendary
  description?: string;   // Optional, max 1000 chars
  createdBy: string;      // User ID
  createdAt: Date;
}
```

### 6. Abuse Controls

| Control | Implementation |
|---------|----------------|
| Rate limit (spots) | 3 spots per user per 24 hours |
| Rate limit (global) | 30 writes per 10 minutes per IP |
| Name validation | 1-100 characters, trimmed |
| Location validation | Valid lat/lng ranges |
| Duplicate check | Same name + ~50m radius |
| Email verification | Required for posting |

**Rate Limiting Configuration:**
- `perUserSpotWriteLimiter`: 3 spots/day per user
- `publicWriteLimiter`: 30 writes/10min per IP
- Duplicate detection: rejects spots with same name within 50 meters

---

## Explicitly Out of Scope (Coming Soon Placeholders)

| Feature | Page | Status |
|---------|------|--------|
| S.K.A.T.E. Battles | `/game`, `/game/active` | Coming Soon |
| TrickMint (Video Upload) | `/trickmint` | Coming Soon |
| Payments/Checkout | `/checkout` | Coming Soon |
| Live Streaming | N/A | Not implemented |
| AR Check-ins | N/A | Not implemented |
| Bounties | N/A | Not implemented |
| Filmer Workflows | N/A | Not implemented |

---

## Authentication Flow

### Sign Up Flow
1. User navigates to `/signup`
2. Enters email + password (min 6 chars)
3. Firebase creates user
4. Verification email sent automatically
5. User redirected to `/profile/setup`
6. User creates profile with unique username
7. User can access app (with restrictions if unverified)

### Sign In Flow
1. User navigates to `/signin`
2. Enters credentials
3. Firebase validates
4. If no profile → redirect to `/profile/setup`
5. If profile exists → redirect to `/home`

### Password Reset Flow
1. User navigates to `/forgot-password`
2. Enters email
3. Firebase sends reset link
4. User clicks link in email
5. User sets new password
6. User redirected to sign in

---

## Unverified User Restrictions

Users who haven't verified their email:
- CAN view the map
- CAN browse spots
- CANNOT create new spots
- See persistent banner prompting verification

---

## Routing Structure

### Public Routes (No Auth Required)
- `/landing` - Conversion landing page
- `/signup` - Registration
- `/signin` - Login
- `/forgot-password` - Password reset
- `/privacy`, `/terms`, `/specs` - Legal pages

### Protected Routes (Auth Required)
- `/home` - Member dashboard
- `/map` - Spot map (allows unverified)
- `/spots/:id` - Spot details (allows unverified)
- `/profile/setup` - Profile creation
- `/settings` - User settings
- `/feed` - Activity feed
- `/leaderboard` - Rankings

### Coming Soon Routes
- `/game` - S.K.A.T.E. lobby
- `/game/active` - Active game
- `/trickmint` - Video upload
- `/checkout` - Payments

---

## Database Schema (MVP Tables)

### users (PostgreSQL)
- Core user data
- Firebase UID reference
- Profile fields (username, stance, experience)

### spots
- Location data (lat, lng)
- Metadata (name, type, tier)
- Creator reference
- Status tracking

### check_ins
- User → Spot relationship
- Timestamp tracking
- Stats aggregation

---

## Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS |
| Maps | Leaflet, React Leaflet |
| State | Zustand, TanStack Query |
| Backend | Express, TypeScript |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Firebase Authentication |
| Hosting | Vercel (planned) |

---

## QA Checklist

### Auth
- [ ] Create account works
- [ ] Verification email arrives
- [ ] Verification link works
- [ ] Login works after verification
- [ ] Forgot password works
- [ ] Password reset email works

### Profile
- [ ] Username uniqueness enforced
- [ ] Username reserved correctly
- [ ] Session persists on refresh

### Map
- [ ] Map loads reliably
- [ ] Spots display correctly
- [ ] Add spot creates in DB
- [ ] Spot appears after creation
- [ ] Rate limit blocks spam
- [ ] Unverified users blocked from posting

### Observability
- [ ] Errors appear in logs
- [ ] Audit events tracked
- [ ] No silent failures

---

## Files Changed

### New Files
- `client/src/pages/forgot-password.tsx`
- `client/src/components/ComingSoon.tsx`
- `client/src/components/EmailVerificationBanner.tsx`

### Modified Files
- `client/src/App.tsx` - Added forgot-password route
- `client/src/pages/signin.tsx` - Added forgot password link
- `client/src/pages/trickmint.tsx` - Coming Soon
- `client/src/pages/ChallengeLobby.tsx` - Coming Soon
- `client/src/pages/skate-game.tsx` - Coming Soon
- `client/src/pages/checkout.tsx` - Coming Soon
- `client/src/pages/cart.tsx` - Disabled checkout button
- `client/src/components/layout/AppShell.tsx` - Added verification banner
- `client/src/components/map/AddSpotModal.tsx` - Added verification gate
- `server/middleware/security.ts` - Updated rate limits (3/day)
- `server/storage/spots.ts` - Added duplicate check
- `server/routes.ts` - Added duplicate validation
