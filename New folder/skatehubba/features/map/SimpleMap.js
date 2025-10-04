import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Simple Map Component for SkateHubba
 * Shows nearby spots and allows check-ins
 */

const SimpleMap = () => {
  const [spots, setSpots] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [checkedInSpot, setCheckedInSpot] = useState(null);

  useEffect(() => {
    loadSpots();
    loadLastCheckin();
  }, []);

  const loadSpots = async () => {
    try {
      // Load mock spots data
      const { mockSpots } = await import('../../constants/mockData');
      setSpots(mockSpots);
    } catch (error) {
      console.error('Error loading spots:', error);
    }
  };

  const loadLastCheckin = async () => {
    try {
      const lastCheckin = await AsyncStorage.getItem('last_checkin');
      if (lastCheckin) {
        setCheckedInSpot(JSON.parse(lastCheckin));
      }
    } catch (error) {
      console.error('Error loading last checkin:', error);
    }
  };

  const handleCheckin = async (spot) => {
    try {
      const checkinData = {
        spotId: spot.id,
        spotName: spot.name,
        timestamp: new Date().toISOString(),
        location: spot.location
      };

      // Save to AsyncStorage
      await AsyncStorage.setItem('last_checkin', JSON.stringify(checkinData));
      setCheckedInSpot(checkinData);

      // Also save to checkin history
      const historyKey = 'checkin_history';
      const existingHistory = await AsyncStorage.getItem(historyKey);
      const history = existingHistory ? JSON.parse(existingHistory) : [];
      
      history.unshift(checkinData);
      if (history.length > 50) history.pop(); // Keep last 50 checkins
      
      await AsyncStorage.setItem(historyKey, JSON.stringify(history));

      Alert.alert(
        '🛹 Checked In!',
        `You're now at ${spot.name}. Happy skating!`,
        [{ text: 'Let\'s Skate! 🚀', style: 'default' }]
      );

    } catch (error) {
      console.error('Checkin error:', error);
      Alert.alert('Error', 'Failed to check in. Please try again.');
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Beginner': return '#16a34a';
      case 'Intermediate': return '#f59e0b';
      case 'Advanced': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getCrowdLevelEmoji = (level) => {
    switch (level) {
      case 'Low': return '🟢';
      case 'Moderate': return '🟡';
      case 'High': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🗺️ Nearby Spots</Text>
      
      {checkedInSpot && (
        <View style={styles.checkinStatus}>
          <Text style={styles.checkinText}>
            📍 Checked in at {checkedInSpot.spotName}
          </Text>
          <Text style={styles.checkinTime}>
            {new Date(checkedInSpot.timestamp).toLocaleTimeString()}
          </Text>
        </View>
      )}

      <ScrollView style={styles.spotsList} showsVerticalScrollIndicator={false}>
        {spots.map((spot) => (
          <View key={spot.id} style={styles.spotCard}>
            <View style={styles.spotHeader}>
              <Text style={styles.spotName}>{spot.name}</Text>
              <Text style={styles.spotRating}>⭐ {spot.rating}</Text>
            </View>
            
            <Text style={styles.spotAddress}>{spot.address}</Text>
            
            <View style={styles.spotDetails}>
              <Text style={[styles.spotDifficulty, { color: getDifficultyColor(spot.difficulty) }]}>
                {spot.difficulty}
              </Text>
              <Text style={styles.spotCrowd}>
                {getCrowdLevelEmoji(spot.crowdLevel)} {spot.crowdLevel}
              </Text>
              <Text style={styles.spotCheckins}>
                {spot.checkins} check-ins
              </Text>
            </View>

            <View style={styles.spotFeatures}>
              {spot.features.map((feature, index) => (
                <Text key={index} style={styles.featureTag}>
                  {feature}
                </Text>
              ))}
            </View>

            <TouchableOpacity 
              style={[
                styles.checkinButton,
                checkedInSpot?.spotId === spot.id && styles.checkinButtonActive
              ]}
              onPress={() => handleCheckin(spot)}
              disabled={checkedInSpot?.spotId === spot.id}
            >
              <Text style={[
                styles.checkinButtonText,
                checkedInSpot?.spotId === spot.id && styles.checkinButtonTextActive
              ]}>
                {checkedInSpot?.spotId === spot.id ? '✅ Checked In' : '📍 Check In'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    padding: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff6a00',
    textAlign: 'center',
    marginBottom: 20,
  },
  checkinStatus: {
    backgroundColor: '#16a34a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  checkinText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  checkinTime: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  spotsList: {
    flex: 1,
  },
  spotCard: {
    backgroundColor: '#222',
    padding: 15,
    marginBottom: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6a00',
  },
  spotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  spotName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  spotRating: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: 'bold',
  },
  spotAddress: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 10,
  },
  spotDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  spotDifficulty: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  spotCrowd: {
    color: '#ccc',
    fontSize: 12,
  },
  spotCheckins: {
    color: '#16a34a',
    fontSize: 12,
  },
  spotFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  featureTag: {
    backgroundColor: '#333',
    color: '#ff6a00',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 10,
    marginRight: 6,
    marginBottom: 4,
  },
  checkinButton: {
    backgroundColor: '#ff6a00',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkinButtonActive: {
    backgroundColor: '#16a34a',
  },
  checkinButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  checkinButtonTextActive: {
    color: '#fff',
  },
});

export default SimpleMap;