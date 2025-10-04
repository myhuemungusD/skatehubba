import React, { useEffect, useRef, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthScreen from '../features/onboarding/AuthScreen';
import OnboardingScreen from '../features/onboarding/OnboardingScreen';
import MainTabNavigator from './MainTabNavigator';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { registerForPushNotifications, NOTIFICATION_ROUTES } from '../services/notifications';

const Stack = createStackNavigator();

function RootNavigator() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const onboardingComplete = await AsyncStorage.getItem('@onboarding_complete');
      setShowOnboarding(!onboardingComplete);
      setLoading(false);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setShowOnboarding(false);
      setLoading(false);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  if (loading) {
    return null; // Or return a loading spinner
  }

  if (showOnboarding) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return (
    <Stack.Navigator initialRouteName="Auth">
      <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      <Stack.Screen 
        name="Main" 
        component={MainTabNavigator} 
        options={{ headerShown: false }} 
      />
    </Stack.Navigator>
  );
}

import ErrorBoundary from '../components/ErrorBoundary';

export default function AppNavigator() {
  const navigationRef = useRef();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      // Register for push notifications when user is authenticated
      registerForPushNotifications(user.uid);

      // Handle incoming messages while app is in foreground
      const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
        console.log('Received foreground message:', remoteMessage);
        const { type } = remoteMessage.data || {};
        // Handle the notification (you could show a local notification here)
      });

      // Handle notification open when app is in background/killed
      const unsubscribeOnNotificationOpen = messaging().onNotificationOpenedApp(remoteMessage => {
        console.log('Background notification opened:', remoteMessage);
        const { type } = remoteMessage.data || {};
        const route = NOTIFICATION_ROUTES[type];
        
        if (route) {
          navigationRef.current?.navigate(route);
        }
      });

      // Check if app was opened from a notification when in killed state
      messaging()
        .getInitialNotification()
        .then(remoteMessage => {
          if (remoteMessage) {
            console.log('Initial notification:', remoteMessage);
            const { type } = remoteMessage.data || {};
            const route = NOTIFICATION_ROUTES[type];
            
            if (route) {
              navigationRef.current?.navigate(route);
            }
          }
        });

      return () => {
        unsubscribeOnMessage();
        unsubscribeOnNotificationOpen();
      };
    }
  }, [user]);

  return (
    <ErrorBoundary>
      <NavigationContainer
        ref={navigationRef}
        onStateChange={(state) => {
          const currentScreen = state?.routes[state.routes.length - 1]?.name;
          if (currentScreen) {
            analyticsService.logScreenView(currentScreen);
          }
        }}
      >
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
