# Web App Google Sign-In Setup Guide

## The Issue

You're seeing "Firebase: Error (auth/internal-error)" on the **web app** (not mobile). This means Google Sign-In needs to be configured in Firebase Console.

## Quick Fix (5 Minutes)

### Step 1: Enable Google Sign-In in Firebase

1. Go to **Firebase Console** → https://console.firebase.google.com
2. Select your project: **SkateHubba**
3. Click **Authentication** (left sidebar)
4. Click **Sign-in method** tab
5. Find **Google** in the providers list
6. Click **Enable** toggle
7. Enter **Support email** (your email)
8. Click **Save**

### Step 2: Add Authorized Domains

Still in the Authentication → Sign-in method page:

1. Scroll down to **Authorized domains** section
2. You should see:
   - `localhost` (already there)
   - `YOUR-PROJECT.firebaseapp.com` (already there)
3. Click **Add domain**
4. Add: `skatehubba010.replit.app` (or your current Replit domain)
5. Click **Add**

### Step 3: Test Google Sign-In

1. Go to: https://skatehubba010.replit.app/auth
2. Click **"Sign in with Google"** button
3. Google popup should appear ✅
4. Select your Google account
5. Should redirect to map page ✅
6. Error should be gone! ✅

## Why This Happens

The Firebase error occurs when:

- ❌ Google provider is disabled in Firebase Console
- ❌ The domain (replit.app) is not in authorized domains list
- ❌ OAuth consent screen is not configured

## Current Status

| Component               | Status         | Fix Required               |
| ----------------------- | -------------- | -------------------------- |
| **Web Firebase Config** | ✅ Correct     | Environment variables set  |
| **Web App Code**        | ✅ Working     | Google Sign-In implemented |
| **Google Provider**     | ❌ Needs setup | Enable in Firebase Console |
| **Authorized Domains**  | ❌ Needs setup | Add replit.app domain      |

## Mobile vs Web Setup

**Mobile App (React Native)**:

- Requires: Web Client ID + SHA-256 fingerprint
- Uses: expo-auth-session for OAuth
- Testing: Requires EAS build (won't work in Expo Go)
- Status: ✅ Code ready, waiting for EAS build

**Web App (React/Vite)**:

- Requires: Google provider enabled + authorized domains
- Uses: Firebase signInWithPopup/signInWithRedirect
- Testing: Works immediately after Firebase Console setup
- Status: ❌ **Needs Firebase Console configuration**

## Troubleshooting

### Error: "This domain is not authorized"

- Add your replit.app domain to Authorized domains in Firebase Console

### Error: "OAuth consent screen not configured"

- Go to Google Cloud Console → OAuth consent screen
- Set up consent screen with app name and support email

### Error: "Invalid origin"

- Make sure the domain in Authorized domains matches exactly (no https://)

## Next Steps

1. ✅ Enable Google provider in Firebase Console
2. ✅ Add `skatehubba010.replit.app` to authorized domains
3. ✅ Test sign-in on web app
4. ✅ Verify redirect to map page works

**Bottom line**: The web app code is working perfectly. You just need to enable Google Sign-In in Firebase Console and add your Replit domain to authorized domains. Takes ~3 minutes! 🛹
