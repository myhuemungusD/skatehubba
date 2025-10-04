import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MapScreen from './screens/MapScreen';

const Tab = createBottomTabNavigator();

// Placeholder screens for now
function ShopScreen() {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>� Shop</Text>
      <Text style={styles.screenSubtitle}>Coming Soon</Text>
    </View>
  );
}

function ProfileScreen() {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>👤 Profile</Text>
      <Text style={styles.screenSubtitle}>Coming Soon</Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#000',
            borderTopColor: '#333',
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: '#ff6a00',
          tabBarInactiveTintColor: '#16a34a',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}
      >
        <Tab.Screen 
          name="Map" 
          component={MapScreen}
          options={{
            tabBarLabel: 'Map',
          }}
        />
        <Tab.Screen 
          name="Shop" 
          component={ShopScreen}
          options={{
            tabBarLabel: 'Shop',
          }}
        />
        <Tab.Screen 
          name="Profile" 
          component={ProfileScreen}
          options={{
            tabBarLabel: 'Profile',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  title: {
    color: '#ff6a00',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#16a34a',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  info: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
});