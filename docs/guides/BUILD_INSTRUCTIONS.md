# Mobile EAS Build Instructions

## Configuration

**mobile/app.config.js** — Expo configuration (JavaScript format)

- Valid plugins: `expo-router`, `expo-build-properties`, `expo-camera`, `expo-location`
- Firebase configs referenced via `googleServicesFile` (Android) and `GoogleService-Info.plist` (iOS)
- Package name: `com.skathubba.app`

**mobile/eas.json** — Build profiles

- `development` — Dev client build with simulator support
- `preview` — Internal distribution with auto-increment, `preview` channel
- `production` — Release builds (app-bundle for Android, Release config for iOS), `production` channel

---

## Build Commands

All EAS commands must be run from the `mobile/` directory.

### 1. Initialize EAS Project (First Time Only)

```bash
cd mobile
eas login
eas init
```

This creates a project and updates your `app.config.js` with the project ID.

### 2. Build Production APK for Android

```bash
cd mobile
eas build --platform android --profile production
```

### 3. Build for iOS (Requires Apple Developer Account)

```bash
cd mobile
eas build --platform ios --profile production
```

### 4. Build Both Platforms

```bash
cd mobile
eas build --platform all --profile production
```

### 5. Submit to App Stores

```bash
cd mobile
eas submit --platform all
```

---

## Expected Build Process

1. **EAS uploads your code** to Expo servers
2. **Firebase configs are bundled**:
   - `google-services.json` (Android)
   - `GoogleService-Info.plist` (iOS)
3. **Build runs** (takes 10-20 minutes)
4. **Download link provided** when complete
5. **Install & test** on device

---

## File Structure

```
mobile/
├── google-services.json           # Android Firebase config
├── GoogleService-Info.plist       # iOS Firebase config
├── app.config.js                  # Expo config (JavaScript)
├── eas.json                       # EAS build profiles
├── package.json                   # Mobile dependencies
├── .detoxrc.json                  # Detox E2E test config
├── app/                           # Expo Router structure
│   ├── auth/
│   │   └── signin.tsx             # Google Sign-In
│   └── (tabs)/
│       └── map.tsx                # Post-auth landing
└── src/
    └── lib/
        └── firebase.config.ts     # Firebase initialization
```

---

## Quick Start

```bash
# 1. Navigate to mobile directory
cd mobile

# 2. Login to Expo
eas login

# 3. Initialize EAS project (first time)
eas init

# 4. Verify config
npx expo config --type public

# 5. Build for Android
eas build --platform android --profile production

# 6. Check build status
eas build:list
```

---

## Troubleshooting

### "eas: command not found"

```bash
npm install -g eas-cli
```

### "Project not found" or "Invalid UUID"

```bash
cd mobile
rm -rf .eas .expo
eas init
```

### "Config parsing error"

```bash
cd mobile
npx expo config --type public
```

Read the error message — it will tell you exactly what's wrong.

### "google-services.json not found"

Make sure you're in the `mobile/` directory when building. The file must be at `mobile/google-services.json`.

### Build fails with authentication error

```bash
eas logout
eas login
```

---

## CI Integration

- **Preview builds**: Generated automatically on PRs via `.github/workflows/mobile-preview.yml`
- **Quality gates**: Typecheck + lint run in the `mobile_quality` CI job
- **Detox E2E**: Android smoke tests run via `mobile_detox_smoke` CI job

---

## Production Readiness

| Component            | Status                             |
| -------------------- | ---------------------------------- |
| **app.config.js**    | Valid (clean JavaScript config)    |
| **eas.json**         | Build profiles configured          |
| **Firebase Configs** | Both Android & iOS files in place  |
| **Google OAuth**     | All platform client IDs configured |
| **Package Name**     | com.skathubba.app                  |
| **Dependencies**     | Managed via pnpm workspace         |
