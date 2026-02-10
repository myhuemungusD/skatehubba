# SkateHubba Mobile App Setup Guide

Complete setup and development guide for the SkateHubba React Native mobile application built with Expo.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Development Workflows](#development-workflows)
5. [Google Authentication Setup](#google-authentication-setup)
6. [Environment Configuration](#environment-configuration)
7. [Building for Production](#building-for-production)
8. [Troubleshooting](#troubleshooting)
9. [Architecture](#architecture)

---

## Overview

The SkateHubba mobile app is a **standalone React Native application** using Expo and expo-router for file-based navigation. It's part of the monorepo but has its own dependency tree and build process.

### Current Status

| Component | Status |
|-----------|--------|
| **Core Implementation** | ✅ Complete - MVP ready |
| **Firebase Auth** | ✅ Integrated with AsyncStorage |
| **Google Sign-In** | ✅ Configured (requires EAS build) |
| **API Integration** | ✅ TanStack React Query setup |
| **State Management** | ✅ Zustand stores |
| **Camera Integration** | ✅ expo-camera configured |
| **CI Integration** | ❌ Not yet wired to CI |
| **E2E Tests (Detox)** | ⚠️ Scaffold only |

### Tech Stack

- **Framework**: Expo SDK 52+ with expo-router
- **Language**: TypeScript
- **UI**: React Native with custom theme
- **Navigation**: expo-router (file-based)
- **State**: Zustand for global state
- **Data Fetching**: TanStack React Query
- **Authentication**: Firebase Auth
- **Camera**: expo-camera with Vision Camera
- **Storage**: AsyncStorage for persistence

---

## Prerequisites

### Required Software

```bash
# Node.js (LTS version)
node --version  # Should be 20.x or higher

# pnpm (for monorepo)
pnpm --version  # Should be 10.x

# Expo CLI (installed per project)
npx expo --version

# EAS CLI (for production builds)
npm install -g eas-cli
eas --version
```

### Mobile Development Tools

**For iOS Development:**
- macOS required
- Xcode 14+ (latest stable)
- iOS Simulator
- Apple Developer Account (for production builds)

**For Android Development:**
- Android Studio
- Android SDK Platform Tools
- Android Emulator or physical device
- Java Development Kit (JDK) 17

**For Quick Testing:**
- Expo Go app ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- **Note**: OAuth won't work in Expo Go

---

## Quick Start

### 1. Install Dependencies

From the monorepo root:

```bash
# Using pnpm (recommended for monorepo)
cd mobile
pnpm install

# OR using npm (if outside monorepo)
cd mobile
npm install
```

### 2. Start Development Server

```bash
# Start Expo dev server
pnpm start
# or: npx expo start

# Start with dev client
pnpm dev

# Run on iOS simulator (macOS only)
pnpm ios

# Run on Android emulator
pnpm android
```

### 3. Open on Device

**Option A: Expo Go (Quick Testing)**
1. Install Expo Go on your phone
2. Scan the QR code from terminal
3. **Limitation**: Google OAuth won't work

**Option B: Development Build (Full Features)**
```bash
# Build development client
eas build --profile development --platform android

# Install on device, then run
pnpm start --dev-client
```

---

## Development Workflows

### File Structure

```
mobile/
├── app/                    # expo-router screens
│   ├── (tabs)/            # Bottom tab navigation
│   │   ├── index.tsx      # Map screen (home)
│   │   ├── game.tsx       # S.K.A.T.E. game
│   │   └── profile.tsx    # User profile
│   ├── (auth)/            # Authentication screens
│   │   └── sign-in.tsx
│   ├── _layout.tsx        # Root layout
│   └── +not-found.tsx     # 404 handler
├── src/
│   ├── components/        # Reusable components
│   │   ├── game/         # Game-specific components
│   │   └── common/       # Shared UI components
│   ├── hooks/            # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useGameSession.ts
│   │   └── useNetworkStatus.ts
│   ├── lib/              # Utilities and config
│   │   ├── firebase.ts   # Firebase initialization
│   │   ├── queryClient.ts # React Query config
│   │   └── analytics.ts  # Analytics setup
│   ├── store/            # Zustand state management
│   │   ├── authStore.ts
│   │   └── gameStore.ts
│   ├── theme.ts          # Design tokens
│   └── types/            # TypeScript types
├── e2e/                   # Detox E2E tests (not integrated)
├── app.json              # Expo configuration
└── package.json          # Dependencies

```

### Hot Reloading

Expo provides fast refresh for instant updates:
- Save any file to see changes immediately
- State is preserved during refresh
- Press `r` in terminal to reload manually

### Debugging

```bash
# Open React Native Debugger
pnpm start
# Press 'j' to open debugger

# View logs
pnpm start
# Logs appear in terminal automatically

# Debug on device
# 1. Shake device to open dev menu
# 2. Enable "Remote JS Debugging"
```

### Running with Backend

```bash
# Terminal 1: Start backend server
cd server
pnpm dev

# Terminal 2: Start mobile app
cd mobile
pnpm start

# Mobile app will connect to:
# - Dev: http://localhost:3000
# - Production: https://api.skatehubba.com
```

---

## Google Authentication Setup

### Why EAS Build is Required

**Expo Go Limitations:**
- ❌ Can't handle custom URL schemes (`sk8hub://`)
- ❌ Bundle ID doesn't match Firebase config
- ❌ Native modules may not work correctly

**EAS Build Benefits:**
- ✅ Custom URL schemes work for OAuth redirect
- ✅ Bundle ID matches Firebase: `sk8.Hub`
- ✅ All native modules compiled
- ✅ Production-ready APK/IPA

### Setup Steps

#### 1. Configure Firebase (Already Done ✅)

The following are already configured in Firebase Console:
- ✅ Web Client ID added to app
- ✅ SHA-256 fingerprint registered
- ✅ OAuth consent screen configured

#### 2. Install EAS CLI

```bash
# Install globally
npm install -g eas-cli

# Login to Expo account
eas login
```

#### 3. Configure EAS (First Time Only)

```bash
cd mobile
eas build:configure
```

This creates `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

#### 4. Build for Android

```bash
# Production build
eas build --platform android --profile production

# Preview build (for testing)
eas build --platform android --profile preview

# Development build (with dev tools)
eas build --platform android --profile development
```

Build process:
1. Dependencies installed
2. Native modules compiled
3. APK created in cloud
4. Download link provided

#### 5. Build for iOS

```bash
# Requires Apple Developer account
eas build --platform ios --profile production

# For testing without App Store
eas build --platform ios --profile preview
```

#### 6. Install and Test

```bash
# After build completes, download APK/IPA
# Install on device

# Test Google Sign-In:
# 1. Open app
# 2. Tap "Sign In"
# 3. Tap "Continue with Google"
# 4. ✅ Google OAuth popup appears
# 5. ✅ Successfully redirects to Map screen
```

---

## Environment Configuration

### Environment Variables

The mobile app uses environment variables from `@skatehubba/config` package:

```typescript
// packages/config/src/firebase.ts
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  // ...
};
```

### Configuration Priority

1. **Shared Config Package** (`@skatehubba/config`)
   - Firebase credentials
   - API endpoints
   - Feature flags

2. **Local `.env` File** (mobile-specific overrides)
   ```bash
   EXPO_PUBLIC_API_URL=http://localhost:3000
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=skatehubba.firebaseapp.com
   ```

3. **EAS Secrets** (production builds)
   ```bash
   eas secret:create --name EXPO_PUBLIC_API_URL --value https://api.skatehubba.com
   ```

### Switching Environments

```bash
# Development (local backend)
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm start

# Staging
EXPO_PUBLIC_API_URL=https://staging-api.skatehubba.com pnpm start

# Production (default in builds)
# Uses values from @skatehubba/config
```

---

## Building for Production

### Pre-build Checklist

- [ ] All tests pass: `pnpm test`
- [ ] TypeScript builds: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] App version bumped in `app.json`
- [ ] Changelog updated
- [ ] Environment secrets configured in EAS

### Android Production Build

```bash
# 1. Update version in app.json
# "version": "1.0.1",
# "android": { "versionCode": 2 }

# 2. Build
eas build --platform android --profile production

# 3. Submit to Google Play
eas submit --platform android
```

### iOS Production Build

```bash
# 1. Update version in app.json
# "version": "1.0.1",
# "ios": { "buildNumber": "2" }

# 2. Build
eas build --platform ios --profile production

# 3. Submit to App Store
eas submit --platform ios
```

### Build Profiles

**Development**: Local testing with dev tools
```bash
eas build --profile development
```

**Preview**: Internal testing (TestFlight, internal distribution)
```bash
eas build --profile preview
```

**Production**: App Store / Google Play release
```bash
eas build --profile production
```

---

## Troubleshooting

### Common Issues

#### Issue: "Metro bundler not found"

```bash
# Solution: Clear cache and reinstall
cd mobile
rm -rf node_modules
pnpm install
pnpm start --clear
```

#### Issue: "Firebase not initialized"

**Cause**: Missing environment variables

**Solution**:
```bash
# Check .env file exists
cat mobile/.env

# Verify config is loaded
cd mobile
node -e "console.log(require('@skatehubba/config').firebaseConfig)"
```

#### Issue: Google Sign-In fails in Expo Go

**Cause**: Expo Go doesn't support custom URL schemes

**Solution**: Use EAS build
```bash
eas build --profile development --platform android
```

#### Issue: "Network request failed"

**Cause**: Backend not running or wrong API URL

**Solution**:
```bash
# Check backend is running
curl http://localhost:3000/api/health

# Verify API URL in app
# mobile/src/lib/api.ts should point to correct backend
```

#### Issue: Build fails with "Gradle error"

**Cause**: Outdated dependencies or cache

**Solution**:
```bash
cd mobile
rm -rf node_modules
pnpm install
eas build --clear-cache --platform android
```

### Getting Help

1. **Check logs**: `pnpm start` shows detailed error messages
2. **Expo docs**: https://docs.expo.dev/
3. **Firebase docs**: https://firebase.google.com/docs/auth
4. **Internal docs**: See `/docs/setup/` for more guides

---

## Architecture

### Navigation Flow

```
app/_layout.tsx (Root)
  ├── app/(tabs)/_layout.tsx (Authenticated)
  │   ├── index.tsx         → Map (home)
  │   ├── game.tsx          → S.K.A.T.E. game
  │   └── profile.tsx       → User profile
  └── app/(auth)/sign-in.tsx (Unauthenticated)
```

### State Management

```typescript
// Auth state (Zustand)
const authStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  signIn: async () => { /* Firebase auth */ },
  signOut: async () => { /* Clear state */ },
}));

// Server data (React Query)
const { data: spots } = useQuery({
  queryKey: ['spots'],
  queryFn: fetchSpots,
});
```

### API Communication

```typescript
// mobile/src/lib/api.ts
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export const api = {
  getSpots: () => fetch(`${API_URL}/api/spots`),
  createCheckin: (data) => fetch(`${API_URL}/api/checkins`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
```

---

## Next Steps

1. **For Development**: Run `pnpm start` and test with Expo Go
2. **For OAuth Testing**: Build with EAS and install on device
3. **For Production**: Submit builds to App Store / Google Play
4. **CI Integration**: Wire mobile builds into GitHub Actions

---

## Related Documentation

- [Firebase Email Setup](./FIREBASE_EMAIL_SETUP.md)
- [Google Sign-In Setup](./GOOGLE_SIGNIN_SETUP.md)
- [Environment Separation](../ENVIRONMENT_SEPARATION.md)
- [Mobile README](../../mobile/README.md)

---

**Need help?** Check `/docs/` for more guides or reach out to the team.

🛹 Happy skating!
