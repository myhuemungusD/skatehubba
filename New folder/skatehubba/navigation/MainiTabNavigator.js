import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import ProfileScreen from '../features/profile/profilescreen';
import ShopScreen from '../features/shop/ShopScreen';
import SessionsScreen from '../features/sessions/SessionsScreen';
import ChallengeScreen from '../features/challenge/ChallengeScreen';
import NotificationScreen from '../features/notifications/NotificationScreen';
import HomeScreen from '../features/home/HomeScreen';
import SpectateSessionScreen from '../features/sessions/SpectateSessionScreen';
import MoreScreen from '../features/more/MoreScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabNavigator() {
  // Simple navigation without authentication or translation for now
  
  // 5 main tabs max for best mobile UX
  const mainTabs = [
    { name: 'Profile', component: ProfileScreen, icon: 'person' },
    { name: 'Challenges', component: ChallengeScreen, icon: 'trophy' },
    { name: 'Sessions', component: SessionsScreen, icon: 'people' },
    { name: 'Shop', component: ShopScreen, icon: 'cart' },
    { name: 'More', component: MoreScreen, icon: 'menu' },
  ];

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#1C1C1E',
        },
        tabBarActiveTintColor: '#FFF',
        tabBarInactiveTintColor: '#666',
      }}
    >
      {mainTabs.map(screen => (
        <Tab.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={screen.icon} size={size} color={color} />
            ),
            tabBarLabel: screen.name,
            tabBarAccessibilityLabel: screen.name,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Main" component={MainTabNavigator} options={{ headerShown: false }} />
        {/* Essential screens only */}
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Home', headerBackTitle: 'Back' }} />
        <Stack.Screen name="SpectateSession" component={SpectateSessionScreen} options={{ title: 'Spectate', headerBackTitle: 'Back' }} />
        <Stack.Screen name="Notifications" component={NotificationScreen} options={{ title: 'Notifications', headerBackTitle: 'Back' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
