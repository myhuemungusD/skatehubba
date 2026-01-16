# Mobile App Setup Required

## The Issue

The mobile app is a **separate React Native application** from the web app. It has its own `package.json` and requires separate dependency installation.

Currently:

- ✅ Web app dependencies installed (in root `/node_modules/`)
- ❌ Mobile app dependencies **NOT installed** (no `/mobile/node_modules/`)

This is why the Google Sign-In code isn't running - the required packages don't exist yet.

## Solution: Install Mobile Dependencies

### Option 1: Local Development (Recommended for Testing)

If you want to test the mobile app locally with Expo Go:

```bash
cd mobile
npm install
npm start
```

Then:

- Scan QR code with Expo Go app on your phone
- **Note**: Google OAuth won't work in Expo Go, but you can test the UI

### Option 2: Build with EAS (For Real Google Auth)

For production Google authentication to work, you MUST build with EAS:

```bash
# Install dependencies first
cd mobile
npm install

# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS for your project
eas build:configure

# Build APK for Android
eas build --platform android --profile production
```

The APK will have:

- ✅ All dependencies bundled
- ✅ Google OAuth working
- ✅ Proper navigation (no bounce-back)

## Why Expo Go Won't Work for Google Sign-In

Expo Go limitations:

- ❌ Can't handle custom URL schemes for OAuth
- ❌ Doesn't compile native modules properly
- ❌ Bundle identifier doesn't match Firebase config

EAS Build creates a standalone app:

- ✅ Custom URL schemes work
- ✅ Native modules compiled
- ✅ Bundle ID matches Firebase (`sk8.Hub`)

## Quick Start: Test the Build

**Fastest path to see Google Sign-In working:**

```bash
# 1. Install mobile dependencies
cd mobile && npm install

# 2. Build with EAS
eas build --platform android --profile production

# 3. Download and install the APK
# 4. Open app → Sign In → Continue with Google
# 5. ✅ Google OAuth popup appears
# 6. ✅ Redirects to Map page after auth
```

## Current Status

| Component                  | Status                 |
| -------------------------- | ---------------------- |
| **Code Implementation**    | ✅ Complete            |
| **Firebase Configuration** | ✅ Complete            |
| **Web Client ID**          | ✅ Added to code       |
| **SHA-256 Fingerprint**    | ✅ In Firebase Console |
| **Mobile Dependencies**    | ❌ Not installed       |
| **EAS Build**              | ⏳ Waiting for build   |

## Next Steps

1. Run `cd mobile && npm install` to install dependencies
2. Run `eas build --platform android` to create production APK
3. Install APK on device and test Google Sign-In
4. Verify navigation: Home → Sign In → Map (no bounce-back)

**Bottom line**: The code is ready, but the mobile app needs to be built with EAS to test Google authentication. Expo Go won't work for OAuth flows. 🛹
