# EAS Build for Monorepo

## Monorepo Structure

SkateHubba is a pnpm workspace monorepo. The mobile app lives in the `mobile/` subdirectory:

```
skatehubba/
├── client/          # React web app (Vite)
├── mobile/          # React Native / Expo app
├── server/          # Express API backend
├── functions/       # Firebase Cloud Functions
├── packages/        # Shared code (config, db, firebase, shared, types, utils)
├── migrations/      # PostgreSQL migrations
├── scripts/         # Build, validation, deploy scripts
└── docs/            # Documentation
```

Do **not** move `mobile/*` to root — this would break the monorepo workspace.

---

## How EAS Works with Subdirectories

EAS fully supports apps in subdirectories. You just need to:

1. **Navigate to the mobile directory first**
2. **Run all EAS commands from there**

That's it! EAS will detect your app correctly.

---

## Build Commands

### Step 1: Navigate to Mobile Directory

```bash
cd mobile
```

Always run EAS commands from the `mobile/` directory.

### Step 2: Login to Expo

```bash
eas login
```

### Step 3: Initialize EAS (First Time Only)

```bash
eas init
```

This creates a project and updates your `app.config.js` with the project ID.

### Step 4: Verify Configuration

```bash
npx expo config --type public
```

This should show your parsed config with no errors.

### Step 5: Build

```bash
eas build --platform android --profile production
```

---

## Configuration Files

**Location:** `mobile/app.config.js`

The mobile app uses a JavaScript config file (not `app.json`):

```javascript
export default {
  expo: {
    name: "SkateHubba",
    slug: "skatehubba",
    version: "1.0.0",
    android: {
      package: "com.skathubba.app",
      googleServicesFile: "./google-services.json",
      // ...
    },
    ios: {
      bundleIdentifier: "com.skathubba.app",
      googleServicesFile: "./GoogleService-Info.plist",
      // ...
    },
    plugins: [
      "expo-router",
      ["expo-build-properties", { ... }],
      ["expo-camera", { ... }],
      ["expo-location", { ... }]
    ]
  }
};
```

**Location:** `mobile/eas.json`

Build profiles:

- `development` — Dev client with simulator support
- `preview` — Internal distribution, `preview` channel
- `production` — Release builds, `production` channel

---

## Common Mistakes to Avoid

| Mistake | Correct Approach |
|---------|-----------------|
| Running EAS from repo root | Run from `mobile/` directory |
| Moving mobile files to root | Keep files in `mobile/` |
| Using `app.json` | Config is in `app.config.js` (JavaScript format) |
| Forgetting Firebase config files | Ensure `google-services.json` and `GoogleService-Info.plist` are in `mobile/` |

---

## Complete Build Process

```bash
# 1. Go to mobile directory
cd mobile

# 2. Clean any corrupted metadata (if needed)
rm -rf .eas .expo

# 3. Login
eas login

# 4. Initialize project
eas init

# 5. Verify config
npx expo config --type public

# 6. Build
eas build --platform android --profile production
```

---

## Troubleshooting

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

### "google-services.json not found"

Make sure you're in the `mobile/` directory when building.

### "Unexpected token" errors in config

Check `app.config.js` for syntax errors:

```bash
cd mobile
node -e "require('./app.config.js')"
```

---

## CI Integration

- **EAS preview builds** are generated on PRs via `.github/workflows/mobile-preview.yml`
- **Quality gates**: `mobile_quality` CI job runs typecheck + lint
- **Detox E2E**: `mobile_detox_smoke` CI job runs Android smoke tests
