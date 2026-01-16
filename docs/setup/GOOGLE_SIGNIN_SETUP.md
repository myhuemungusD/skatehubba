# Google Sign-In Setup Guide for SkateHubba 🛹

## Current Status

✅ Sign-in screen created at `mobile/app/auth/signin.tsx`  
✅ Navigation configured to go to map page after sign-in  
⚠️ **Google Auth requires EAS native build** (won't work in Expo Go)

## 4-Minute Setup (Copy-Paste Ready)

### Step 1: Get Android SHA-1 Fingerprint

```bash
cd mobile
npx expo fetch:android:hashes
```

You'll see output like:

```
Certificate fingerprints:
  SHA-1: 69:4F:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

**Copy that SHA-1**

### Step 2: Add SHA-1 to Firebase Console (30 seconds)

1. Go to: https://console.firebase.google.com/project/YOUR_PROJECT/authentication/providers
2. Click **Google provider** → Enable if not already
3. Under "Android apps" → Click **"Add fingerprint"**
4. Paste the SHA-1 from Step 1 → **Save**
5. Copy the **Web Client ID** (looks like `123456789-abc123.apps.googleusercontent.com`)

### Step 3: Update app.json with Web Client ID

In `mobile/app.json`, line 83:

```json
"firebase": {
  "webClientId": "YOUR_ACTUAL_WEB_CLIENT_ID_HERE"
}
```

Replace `REPLACE_WITH_YOUR_WEB_CLIENT_ID_FROM_FIREBASE` with your actual Web Client ID from Firebase Console.

### Step 4: Install Required Packages

```bash
cd mobile
npm install expo-auth-session expo-web-browser
```

### Step 5: Update signin.tsx for Production

Replace the temp code in `mobile/app/auth/signin.tsx` with this:

```typescript
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase.config';
import { showMessage } from 'react-native-flash-message';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Get webClientId from app.json
  const webClientId = Constants.expoConfig?.extra?.firebase?.webClientId;

  // Configure Google Sign In
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: webClientId,
    // Add these if you have them:
    // iosClientId: "YOUR_IOS_CLIENT_ID",
    // androidClientId: "YOUR_ANDROID_CLIENT_ID",
  });

  // Handle Google Sign In response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleSignIn(id_token);
    }
  }, [response]);

  const handleGoogleSignIn = async (idToken: string) => {
    try {
      setLoading(true);
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);

      showMessage({
        message: 'Signed in successfully! 🛹',
        type: 'success',
      });

      // Navigate to map page after successful sign-in
      router.replace('/(tabs)/map' as any);
    } catch (error: any) {
      showMessage({
        message: error?.message || 'Failed to sign in with Google',
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGooglePress = async () => {
    try {
      await promptAsync();
    } catch (error: any) {
      showMessage({
        message: 'Failed to initiate Google sign-in',
        type: 'danger',
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Branding */}
        <View style={styles.header}>
          <Text style={styles.logo}>🛹</Text>
          <Text style={styles.title}>SkateHubba</Text>
          <Text style={styles.subtitle}>
            Remote S.K.A.T.E. challenges, AR check-ins, and skate spots
          </Text>
        </View>

        {/* Google Sign In Button */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
          style={[styles.googleButton, (loading || !request) && styles.buttonDisabled]}
          onPress={handleGooglePress}
          disabled={loading || !request}
        >
          {loading ? (
            <ActivityIndicator color={SKATE.colors.white} />
          ) : (
            <>
              <Ionicons name="logo-google" size={24} color={SKATE.colors.white} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Info Text */}
        <Text style={styles.infoText}>
          Sign in to access challenges, leaderboards, and connect with skaters worldwide
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SKATE.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SKATE.spacing.xxxl,
  },
  logo: {
    fontSize: 80,
    marginBottom: SKATE.spacing.md,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: SKATE.colors.white,
    marginBottom: SKATE.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: SKATE.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SKATE.spacing.md,
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.lg,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    width: '100%',
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoText: {
    marginTop: SKATE.spacing.xl,
    fontSize: 14,
    color: SKATE.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
});
```

### Step 6: Build with EAS

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure the project
eas build:configure

# Build for Android
eas build --platform android --profile production

# Or build for both platforms
eas build --platform all --profile production
```

## Testing the Flow

### In Development (Expo Go)

- Will show warning message: "Google Sign-In requires native build (EAS)"
- Will navigate to map page after 2 seconds for testing

### In Production (EAS Build)

1. User taps "Sign In" on home screen
2. Redirected to `auth/signin` screen
3. Taps "Continue with Google"
4. Google OAuth popup appears
5. User selects Google account
6. After successful auth, navigates to map page at `/(tabs)/map`

## Why It Doesn't Work in Expo Go

Expo Go can't handle native Google Sign-In flows because:

- It requires custom URL schemes configured in `app.json`
- Native modules need to be compiled into the app
- OAuth redirect URIs must match your bundle identifier

**Solution**: Always test Google Sign-In in standalone builds (EAS) or development builds.

## Environment Variables Needed

Add these to your `.env` file (mobile app):

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:android:abc123
```

## Troubleshooting

### "Sign in failed" error

- Check that Web Client ID in `app.json` matches Firebase Console
- Verify SHA-1 is added to Firebase Console for Android
- Make sure you're testing on EAS build, not Expo Go

### "Invalid redirect URI" error

- Your Android package name must match Firebase Console
- Check `mobile/app.json` → `android.package` = `com.skatehubba.app`
- Rebuild with EAS after changing package name

### Navigation doesn't work

- Verify route exists: `mobile/app/(tabs)/map.tsx`
- Check `useAuth` hook is working: user should be set after sign-in
- Look for errors in Metro bundler logs

## Next Steps

1. ✅ Get SHA-1 fingerprint
2. ✅ Add to Firebase Console
3. ✅ Update `app.json` with Web Client ID
4. ✅ Run `eas build --platform android`
5. ✅ Test on physical device or emulator with EAS build

**Expected result**: Google Sign-In works → User sees map page with skate spots 🛹🔥
