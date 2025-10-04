import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  Alert 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SkateHubba Profile Screen
 * User stats, achievements, and progression
 */

const ProfileScreen = () => {
  const [userProfile, setUserProfile] = useState(null);
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      // Load user profile
      const savedProfile = await AsyncStorage.getItem('user_profile');
      const profile = savedProfile ? JSON.parse(savedProfile) : {
        username: 'SkaterDude',
        level: 1,
        xp: 0,
        totalSessions: 0,
        totalTricks: 0,
        favoriteSpot: 'None',
        joinDate: new Date().toISOString(),
        badges: ['🛹 First Session', '📍 First Check-in'],
        skateboard: {
          deck: 'Stock Deck',
          wheels: 'Basic Wheels',
          trucks: 'Standard Trucks',
          bearings: 'ABEC-5'
        }
      };

      // Load coins
      const savedCoins = await AsyncStorage.getItem('user_coins');
      setCoins(savedCoins ? parseInt(savedCoins) : 250);

      // Load inventory
      const savedInventory = await AsyncStorage.getItem('user_inventory');
      setInventory(savedInventory ? JSON.parse(savedInventory) : []);

      // Load check-in history
      const savedHistory = await AsyncStorage.getItem('checkin_history');
      setCheckinHistory(savedHistory ? JSON.parse(savedHistory) : []);

      setUserProfile(profile);
      setLoading(false);

    } catch (error) {
      console.error('Error loading profile:', error);
      setLoading(false);
    }
  };

  const calculateLevel = (xp) => {
    return Math.floor(xp / 100) + 1;
  };

  const getXpForNextLevel = (xp) => {
    const currentLevel = calculateLevel(xp);
    const xpForNextLevel = currentLevel * 100;
    return xpForNextLevel - xp;
  };

  const getLevelProgressPercentage = (xp) => {
    const currentLevelBase = (calculateLevel(xp) - 1) * 100;
    const progressInCurrentLevel = xp - currentLevelBase;
    return (progressInCurrentLevel / 100) * 100;
  };

  const handleEditProfile = () => {
    Alert.alert(
      '🛹 Edit Profile',
      'Profile editing coming soon! Stay tuned for username changes, avatar customization, and more.',
      [{ text: 'Cool! 🔥', style: 'default' }]
    );
  };

  const handleViewAchievements = () => {
    const badgeList = userProfile?.badges?.join('\n') || 'No badges yet';
    Alert.alert(
      '🏆 Your Achievements',
      badgeList,
      [{ text: 'Keep Grinding! 💪', style: 'default' }]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>👤 Loading Profile...</Text>
        <Text style={styles.loadingSubtext}>Getting your stats ready</Text>
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>❌ Failed to load profile</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadProfileData}>
          <Text style={styles.retryButtonText}>🔄 Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatar}>🛹</Text>
        </View>
        <Text style={styles.username}>{userProfile.username}</Text>
        <Text style={styles.joinDate}>
          Member since {new Date(userProfile.joinDate).toLocaleDateString()}
        </Text>
      </View>

      {/* Level & XP */}
      <View style={styles.levelContainer}>
        <View style={styles.levelInfo}>
          <Text style={styles.levelText}>Level {calculateLevel(userProfile.xp)}</Text>
          <Text style={styles.xpText}>{userProfile.xp} XP</Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${getLevelProgressPercentage(userProfile.xp)}%` }
            ]} 
          />
        </View>
        <Text style={styles.nextLevelText}>
          {getXpForNextLevel(userProfile.xp)} XP to next level
        </Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{coins}</Text>
          <Text style={styles.statLabel}>💰 Coins</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userProfile.totalSessions}</Text>
          <Text style={styles.statLabel}>🏁 Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userProfile.totalTricks}</Text>
          <Text style={styles.statLabel}>🎯 Tricks</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{checkinHistory.length}</Text>
          <Text style={styles.statLabel}>📍 Check-ins</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{inventory.length}</Text>
          <Text style={styles.statLabel}>🎒 Items</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{userProfile.badges?.length || 0}</Text>
          <Text style={styles.statLabel}>🏆 Badges</Text>
        </View>
      </View>

      {/* Current Skateboard Setup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛹 Current Setup</Text>
        <View style={styles.skateboardSetup}>
          <View style={styles.setupItem}>
            <Text style={styles.setupLabel}>Deck:</Text>
            <Text style={styles.setupValue}>{userProfile.skateboard.deck}</Text>
          </View>
          <View style={styles.setupItem}>
            <Text style={styles.setupLabel}>Wheels:</Text>
            <Text style={styles.setupValue}>{userProfile.skateboard.wheels}</Text>
          </View>
          <View style={styles.setupItem}>
            <Text style={styles.setupLabel}>Trucks:</Text>
            <Text style={styles.setupValue}>{userProfile.skateboard.trucks}</Text>
          </View>
          <View style={styles.setupItem}>
            <Text style={styles.setupLabel}>Bearings:</Text>
            <Text style={styles.setupValue}>{userProfile.skateboard.bearings}</Text>
          </View>
        </View>
      </View>

      {/* Recent Check-ins */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 Recent Check-ins</Text>
        {checkinHistory.slice(0, 3).map((checkin, index) => (
          <View key={index} style={styles.checkinItem}>
            <Text style={styles.checkinSpot}>{checkin.spotName}</Text>
            <Text style={styles.checkinTime}>
              {new Date(checkin.timestamp).toLocaleDateString()}
            </Text>
          </View>
        ))}
        {checkinHistory.length === 0 && (
          <Text style={styles.emptyText}>No check-ins yet. Hit the map to get started! 🗺️</Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton} onPress={handleEditProfile}>
          <Text style={styles.actionButtonText}>✏️ Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleViewAchievements}>
          <Text style={styles.actionButtonText}>🏆 Achievements</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Padding */}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  loadingText: {
    color: '#ff6a00',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  loadingSubtext: {
    color: '#16a34a',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#ff6a00',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff6a00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatar: {
    fontSize: 40,
  },
  username: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  joinDate: {
    color: '#16a34a',
    fontSize: 14,
    opacity: 0.8,
  },
  levelContainer: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  levelInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  levelText: {
    color: '#ff6a00',
    fontSize: 20,
    fontWeight: 'bold',
  },
  xpText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ff6a00',
    borderRadius: 4,
  },
  nextLevelText: {
    color: '#ccc',
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 15,
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#222',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
  },
  statNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statLabel: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'center',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    color: '#ff6a00',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  skateboardSetup: {
    backgroundColor: '#222',
    padding: 15,
    borderRadius: 12,
  },
  setupItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  setupLabel: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  setupValue: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkinItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  checkinSpot: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  checkinTime: {
    color: '#16a34a',
    fontSize: 12,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#ff6a00',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  bottomPadding: {
    height: 20,
  },
});

export default ProfileScreen;
