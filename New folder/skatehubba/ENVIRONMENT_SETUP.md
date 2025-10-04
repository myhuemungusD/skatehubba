# SkateHubba Environment Setup

## Quick Start

1. **Copy the environment template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Get your Firebase configuration:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (or create one)
   - Go to Project Settings > General > Your apps
   - Copy the config values

3. **Update `.env.local` with your actual values:**
   ```bash
   # Replace the placeholder values with your actual Firebase config
   FIREBASE_API_KEY=your_actual_api_key
   FIREBASE_PROJECT_ID=your_actual_project_id
   # ... etc
   ```

## Important Security Notes

- ✅ **`.env.local`** - Contains your actual secrets (NOT committed to git)
- ✅ **`.env.example`** - Template with placeholder values (committed to git)
- 🚫 **Never commit actual API keys to version control**

## Environment Variables Explained

### Firebase Configuration
- `FIREBASE_API_KEY` - Your Firebase Web API key
- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- `FIREBASE_APP_ID` - Your Firebase app ID
- `FIREBASE_AUTH_DOMAIN` - Usually `[project-id].firebaseapp.com`
- `FIREBASE_STORAGE_BUCKET` - Usually `[project-id].appspot.com`
- `FIREBASE_MESSAGING_SENDER_ID` - For push notifications
- `FIREBASE_MEASUREMENT_ID` - For Google Analytics (optional)

### Expo/React Native
The `EXPO_PUBLIC_` prefix makes variables available in client-side React Native code. Both versions are included for compatibility.

## Troubleshooting

If you see "Missing Firebase configuration" error:
1. Ensure `.env.local` exists
2. Check that all required fields are filled
3. Restart your development server after making changes