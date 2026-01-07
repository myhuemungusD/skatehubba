import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase.config';
import { showMessage } from 'react-native-flash-message';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';
import { useAuth } from '@/hooks/useAuth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  // Configure Google Sign In with expo-auth-session
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  // Redirect to map if already authenticated
  useEffect(() => {
    if (user) {
      router.replace('/(tabs)/map' as any);
    }
  }, [user]);

  // Handle Google OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleCredential(id_token);
    } else if (response?.type === 'error') {
      showMessage({
        message: response.error?.message || 'Google sign-in failed',
        type: 'danger',
      });
    }
  }, [response]);

  const handleGoogleCredential = async (idToken: string) => {
    try {
      setLoading(true);
      
      showMessage({
        message: 'Signing in with Google... 🛹',
        type: 'info',
      });

      // Exchange Google ID token for Firebase credential
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      
      if (result.user) {
        showMessage({
          message: `Welcome ${result.user.displayName || 'Skater'}! 🛹`,
          type: 'success',
        });
        
        // Navigate to map after successful sign-in
        setTimeout(() => {
          router.replace('/(tabs)/map' as any);
        }, 500);
      }
    } catch (error: any) {
      showMessage({
        message: error?.message || 'Failed to sign in with Google',
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (
      !request ||
      !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
      !process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
    ) {
      showMessage({
        message: 'Google Sign-In not configured. Set Expo Google client IDs in environment variables.',
        type: 'warning',
        duration: 4000,
      });
      return;
    }

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
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
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

        {/* Dev Note */}
        <Text style={styles.devNote}>
          Requires EAS build to test{'\n'}
          Won't work in Expo Go
        </Text>

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
    backgroundColor: SKATE.colors.ink,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SKATE.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SKATE.spacing.xxl,
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
    color: SKATE.colors.lightGray,
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
  devNote: {
    marginTop: SKATE.spacing.md,
    fontSize: 12,
    color: SKATE.colors.neon,
    textAlign: 'center',
    fontStyle: 'italic',
    maxWidth: 300,
  },
  infoText: {
    marginTop: SKATE.spacing.xl,
    fontSize: 14,
    color: SKATE.colors.lightGray,
    textAlign: 'center',
    maxWidth: 320,
  },
});
