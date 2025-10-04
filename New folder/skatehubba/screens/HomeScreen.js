import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser, useAuth } from '../services/userStore';
import { signInWithGoogle, signInAnonymouslyWithUpgrade } from '../services/auth';
import { log } from '../services/logger';

export const CustomText = ({ children }) => <Text style={styles.text}>{children}</Text>;

export default function HomeScreen() {
  const navigation = useNavigation();
  const user = useUser();
  const auth = useAuth();

  useEffect(() => {
    log.info('HomeScreen mounted', { isAuthenticated: auth.isAuthenticated, isReady: auth.isReady });
  }, []);

  // Show loading while auth state is being determined
  if (!auth.isReady) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#FFD600" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Authenticated user - show main navigation options
  if (auth.isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🛹 Welcome back{user.displayName ? `, ${user.displayName}` : ''}!</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => {
              log.userAction('navigate_to_spots');
              navigation.navigate('Sessions');
            }}
          >
            <Text style={styles.buttonText}>Find Sessions</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={() => {
              log.userAction('navigate_to_challenges');
              navigation.navigate('Shop');
            }}
          >
            <Text style={styles.buttonText}>Browse Challenges</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={() => {
              log.userAction('navigate_to_profile');
              navigation.navigate('Profile');
            }}
          >
            <Text style={styles.buttonText}>My Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>XP: {user.xp}</Text>
          {user.isAnonymous && (
            <TouchableOpacity 
              style={styles.upgradeButton}
              onPress={handleUpgradeAccount}
            >
              <Text style={styles.upgradeText}>Upgrade Account</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Not authenticated - show sign-in options
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛹 Welcome to SkateHubba!</Text>
      <CustomText>Your ultimate skate community hub</CustomText>
      <CustomText>Connect • Session • Progress</CustomText>
      
      <View style={styles.authContainer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleGoogleSignIn}
        >
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={handleAnonymousSignIn}
        >
          <Text style={styles.buttonText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  async function handleGoogleSignIn() {
    log.userAction('attempt_google_signin');
    user.setLoading(true);
    
    const result = await signInWithGoogle();
    if (!result.ok) {
      log.error('Google sign-in failed:', result.message);
      // TODO: Show user-friendly error message in UI
    }
    
    user.setLoading(false);
  }

  async function handleAnonymousSignIn() {
    log.userAction('attempt_anonymous_signin');
    user.setLoading(true);
    
    const result = await signInAnonymouslyWithUpgrade();
    if (!result.ok) {
      log.error('Anonymous sign-in failed:', result.message);
      // TODO: Show user-friendly error message in UI
    }
    
    user.setLoading(false);
  }

  async function handleUpgradeAccount() {
    log.userAction('attempt_account_upgrade');
    // This would trigger the upgrade flow
    await handleGoogleSignIn();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181b1e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD600',
    marginBottom: 20,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 10,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 30,
    gap: 15,
  },
  authContainer: {
    width: '100%',
    marginTop: 40,
    gap: 15,
  },
  primaryButton: {
    backgroundColor: '#FFD600',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FFD600',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#181b1e',
  },
  statsContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  statsText: {
    fontSize: 18,
    color: '#FFD600',
    fontWeight: 'bold',
  },
  upgradeButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: '#FF6B35',
    borderRadius: 15,
  },
  upgradeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
