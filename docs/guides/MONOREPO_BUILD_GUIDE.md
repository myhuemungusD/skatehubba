# ✅ EAS Build for Monorepo - Correct Setup

## ⚠️ CRITICAL: DO NOT Move Files to Root

Your project is a **monorepo**:

```
/workspace/
├── client/          ← React web app
├── mobile/          ← React Native mobile app (Expo)
├── server/          ← Express backend
└── shared/          ← Shared types/code
```

**Moving `mobile/*` to root would destroy your entire project!**

---

## ✅ How EAS Works with Subdirectories

EAS **fully supports** apps in subdirectories. You just need to:

1. **Navigate to the mobile directory first**
2. **Run all EAS commands from there**

That's it! EAS will detect your app correctly.

---

## Build Commands (Correct Method)

### Step 1: Navigate to Mobile Directory

```bash
cd mobile
```

**IMPORTANT:** Always run EAS commands from `/workspace/mobile/`, not from `/workspace/`

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

## Why Your Current Setup is Correct

✅ **Files in `/workspace/mobile/`:**

- `app.config.js` ✅ Clean JavaScript config
- `eas.json` ✅ Build profiles
- `google-services.json` ✅ Android Firebase
- `GoogleService-Info.plist` ✅ iOS Firebase
- `package.json` ✅ Mobile dependencies
- `app/` ✅ Source code

✅ **Commands run from `/workspace/mobile/`:**

```bash
cd mobile
eas login
eas init
eas build --platform android
```

---

## Common Mistakes to Avoid

❌ **Running EAS from root:** `cd /workspace && eas build`
✅ **Running EAS from mobile:** `cd /workspace/mobile && eas build`

❌ **Moving mobile files to root** (breaks monorepo)
✅ **Keeping files in mobile/** (correct)

---

## Complete Build Process

```bash
# 1. Go to mobile directory
cd /home/runner/workspace/mobile

# 2. Clean any corrupted metadata (if needed)
rm -rf .eas .expo android ios

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

Read the error message - it will tell you exactly what's wrong.

### "google-services.json not found"

Make sure you're in the `mobile/` directory when building.

### "Unexpected token" or "typeof" errors

Your `app.config.js` is clean now. If you see this, check for hidden characters:

```bash
cd mobile
file app.config.js
head -20 app.config.js
```

---

## Your Current Configuration

**Location:** `/workspace/mobile/app.config.js`

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
      ["expo-build-properties", {...}],
      ["expo-camera", {...}],
      ["expo-location", {...}]
    ]
  }
};
```

This is **correct and valid!**

---

## Quick Start (Copy/Paste)

```bash
# Navigate to mobile app
cd /home/runner/workspace/mobile

# Login to Expo
eas login

# Initialize project (first time)
eas init

# Build for Android
eas build --platform android --profile production

# Check build status
eas build:list
```

---

## Status: Ready to Build ✅

Your setup is **100% correct** for a monorepo:

- ✅ Mobile app in `mobile/` subdirectory
- ✅ Config files in correct location
- ✅ Firebase configs in place
- ✅ Dependencies installed
- ✅ Google Sign-In configured

**Just run the commands from the `mobile/` directory and it will work!** 🚀🛹
