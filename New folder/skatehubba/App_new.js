import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import SystemTester from './features/testing/SystemTester';
import SimpleMap from './features/map/SimpleMap';

const Tab = createBottomTabNavigator();

// Map Screen Component
function MapScreen() {
  const [showTester, setShowTester] = React.useState(false);
  
  return (
    <View style={styles.screenContainer}>
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* Toggle between Map and System Tester */}
        <View style={styles.toggleContainer}>
          <Text 
            style={[styles.toggleButton, !showTester && styles.toggleButtonActive]}
            onPress={() => setShowTester(false)}
          >
            🗺️ Map
          </Text>
          <Text 
            style={[styles.toggleButton, showTester && styles.toggleButtonActive]}
            onPress={() => setShowTester(true)}
          >
            🧪 Tests
          </Text>
        </View>

        {showTester ? <SystemTester /> : <SimpleMap />}
      </ScrollView>
    </View>
  );
}

// Shop Screen Component
function ShopScreen() {
  const [shopItems, setShopItems] = React.useState([]);

  React.useEffect(() => {
    // Load shop items from mock data
    import('./constants/mockData').then(({ shopItems }) => {
      setShopItems(shopItems.slice(0, 3)); // Show first 3 items
    });
  }, []);

  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>🛒 Shop</Text>
      <Text style={styles.screenSubtitle}>Gear up for your session</Text>
      
      <ScrollView style={styles.shopContainer} showsVerticalScrollIndicator={false}>
        {shopItems.map((item) => (
          <View key={item.id} style={styles.shopItem}>
            <Text style={styles.shopItemName}>{item.name}</Text>
            <Text style={styles.shopItemPrice}>${item.price}</Text>
            <Text style={styles.shopItemStock}>
              {item.inStock ? '✅ In Stock' : '❌ Out of Stock'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Profile Screen Component
function ProfileScreen() {
  const [userProfile, setUserProfile] = React.useState(null);

  React.useEffect(() => {
    // Load user profile from mock data
    import('./constants/mockData').then(({ mockUserProfile }) => {
      setUserProfile(mockUserProfile);
    });
  }, []);

  if (!userProfile) {
    return (
      <View style={styles.screenContainer}>
        <Text style={styles.screenTitle}>👤 Profile</Text>
        <Text style={styles.screenSubtitle}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>👤 {userProfile.displayName}</Text>
      <ScrollView contentContainerStyle={styles.profileScrollContainer}>
        <View style={styles.profileContainer}>
          <Text style={styles.profileStat}>Level {userProfile.level}</Text>
          <Text style={styles.profileStat}>{userProfile.xp} XP</Text>
          <Text style={styles.profileStat}>{userProfile.totalCheckins} Check-ins</Text>
          <Text style={styles.profileTricks}>
            Latest: {userProfile.tricksLanded.slice(-2).join(', ')}
          </Text>
          
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>Session Stats</Text>
            <Text style={styles.statItem}>Sessions: {userProfile.stats.totalSessions}</Text>
            <Text style={styles.statItem}>Success Rate: {userProfile.stats.successRate}%</Text>
            <Text style={styles.statItem}>Avg Session: {userProfile.stats.averageSessionTime}min</Text>
          </View>
        </View>
      </ScrollView>
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
  screenContainer: {
    flex: 1,
    backgroundColor: '#111',
  },
  scrollContainer: {
    flex: 1,
  },
  screenTitle: {
    color: '#ff6a00',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  screenSubtitle: {
    color: '#16a34a',
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  toggleButton: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 10,
    marginHorizontal: 5,
    backgroundColor: '#333',
    color: '#ccc',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleButtonActive: {
    backgroundColor: '#ff6a00',
    color: '#fff',
  },
  shopContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  shopItem: {
    backgroundColor: '#222',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6a00',
  },
  shopItemName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  shopItemPrice: {
    color: '#16a34a',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  shopItemStock: {
    color: '#ccc',
    fontSize: 12,
  },
  profileScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  profileContainer: {
    backgroundColor: '#222',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 250,
    width: '100%',
    maxWidth: 400,
  },
  profileStat: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  profileTricks: {
    color: '#16a34a',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
    marginBottom: 20,
  },
  statsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#444',
    paddingTop: 15,
    width: '100%',
  },
  statsTitle: {
    color: '#ff6a00',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  statItem: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 5,
  },
});