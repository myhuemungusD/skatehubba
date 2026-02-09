# SkateHubba Mobile

Expo + React Native app for SkateHubba — discover skate spots, play S.K.A.T.E. battles, and climb the leaderboard.

## Status

- **Early MVP** — core screens and game flow implemented, not yet wired to CI or production.
- Auth: Firebase email + Google OAuth sign-in.
- S.K.A.T.E. battle: turn-based trick recording, dual-vote judging, letter tracking.
- Spot map: location-based spot discovery with tier markers.
- Leaderboard, user search, settings, and closet screens in place.
- Detox E2E scaffold added (smoke test + config only).

## Tech Stack

- **Framework**: Expo with expo-router (file-based routing)
- **Language**: TypeScript
- **State**: Zustand (client) + TanStack React Query (server)
- **Auth**: Firebase Auth with AsyncStorage persistence
- **Backend**: Firestore + Firebase Cloud Functions + Express API
- **Camera**: react-native-vision-camera (120fps trick recording)
- **Validation**: Zod schemas for Firestore documents

## Scripts

```bash
pnpm start          # Start Expo dev server
pnpm dev            # Start with dev client
pnpm ios            # Run on iOS
pnpm android        # Run on Android
pnpm e2e:smoke      # Run Detox smoke test (requires native build)
```

## Project Structure

```
mobile/
  app/              # Expo Router screens
    (tabs)/          # Tab navigation (hub, map, play, shop, closet)
    auth/            # Sign-in screen
    challenge/       # New challenge flow
    game/            # S.K.A.T.E. battle screen
    profile/         # User profile view
  src/
    components/      # Reusable UI components (game, common)
    hooks/           # Auth, game session, network hooks
    lib/             # Firebase config, query client, analytics
    store/           # Zustand stores (auth, game, network)
    theme.ts         # Design tokens (colors, spacing, typography)
    types/           # TypeScript interfaces
  e2e/              # Detox E2E tests
```

## Notes

- E2E scripts require native projects (ios/android) to exist before running.
- Runtime dependencies are managed at the monorepo root via pnpm workspaces.
- Firebase config is shared from `@skatehubba/config` package.
