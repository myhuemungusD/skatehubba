# Features

Feature-specific components and hooks organized by domain.

## Overview

This directory contains self-contained feature modules that encapsulate domain-specific business logic, components, and hooks. Each feature is organized in its own subdirectory with related components and hooks.

## Feature Modules

### Check-ins (`checkins/`)

Location-based check-in functionality with replay attack prevention.

**Components:**

- `CheckInButton.tsx` - Check-in button with geolocation validation

**Hooks:**

- `useCheckIn.ts` - Check-in mutation with nonce-based replay detection

**Key Features:**

- Nonce-based replay attack prevention
- Geolocation requirement enforcement
- Error handling for rate limits and quota

### Feed (`feed/`)

Real-time activity feed powered by Firestore.

**Hooks:**

- `useRealtimeFeed.ts` - Live check-in feed with pagination

**Key Features:**

- Real-time Firestore listeners
- Infinite scroll pagination
- Online/offline status tracking

### Leaderboard (`leaderboard/`)

Real-time leaderboard rankings.

**Hooks:**

- `useRealtimeLeaderboard.ts` - Live leaderboard updates

**Key Features:**

- Real-time Firestore sync
- Top 100 rankings
- Score updates

### Social (`social/`)

Social features including profiles and user interactions.

#### Public Profile (`social/public-profile/`)

**Components:**

- `PublicProfileView.tsx` - Public profile display
- `components/TrickBagAggregator.tsx` - Aggregate trick statistics

**Hooks:**

- `useUserLookup.ts` - Username to user ID resolution

#### Bolts Showcase (`social/bolts-showcase/`)

**Components:**

- `BoltsShowcase.tsx` - Display user's bolt achievements

## Architecture Patterns

### Feature Organization

```
features/
  feature-name/
    ComponentName.tsx    # Feature components
    useFeatureName.ts    # Feature hooks
    types.ts             # Feature-specific types (if needed)
    utils.ts             # Feature utilities (if needed)
    *.test.ts            # Tests
```

### Best Practices

1. **Encapsulation** - Keep feature logic self-contained
2. **Reusability** - Extract common patterns to shared hooks/components
3. **Testing** - Each feature should have comprehensive tests
4. **Type Safety** - Use TypeScript for all feature code
5. **Error Handling** - Handle errors gracefully with user-friendly messages

## Testing

Run feature tests:

```bash
pnpm vitest run features/
```

## Adding New Features

When adding a new feature:

1. Create a new directory: `features/my-feature/`
2. Add components and hooks specific to the feature
3. Write comprehensive tests
4. Document the feature in this README
5. Update the main app to integrate the feature
