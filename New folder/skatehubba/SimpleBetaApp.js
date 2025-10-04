import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import your beta screens
import BetaDashboardScreen from './features/beta/BetaDashboardScreen';
import BetaShopScreen from './features/beta/BetaShopScreen';
import BetaAvatarScreen from './features/beta/BetaAvatarScreen';
import BetaTradingScreen from './features/beta/BetaTradingScreen';
import BetaTestRunner from './features/beta/BetaTestRunner';

const Stack = createStackNavigator();

const SimpleBetaApp = () => {
  const userId = 'test-user-123'; // Mock user ID for testing

  return (
    <SafeAreaView style={styles.container}>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="BetaDashboard"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#3b82f6',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Stack.Screen 
            name="BetaDashboard" 
            options={{ title: '🛹 SkateHubba Beta Dashboard' }}
          >
            {(props) => <BetaDashboardScreen {...props} userId={userId} />}
          </Stack.Screen>
          
          <Stack.Screen 
            name="BetaShop" 
            options={{ title: '🛒 Beta Shop' }}
          >
            {(props) => <BetaShopScreen {...props} userId={userId} />}
          </Stack.Screen>
          
          <Stack.Screen 
            name="BetaAvatar" 
            options={{ title: '👤 Beta Avatar' }}
          >
            {(props) => <BetaAvatarScreen {...props} userId={userId} />}
          </Stack.Screen>
          
          <Stack.Screen 
            name="BetaTrading" 
            options={{ title: '🔄 Beta Trading' }}
          >
            {(props) => <BetaTradingScreen {...props} userId={userId} />}
          </Stack.Screen>
          
          <Stack.Screen 
            name="BetaTestRunner" 
            options={{ title: '🧪 Test Runner' }}
          >
            {() => <BetaTestRunner />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});

export default SimpleBetaApp;
