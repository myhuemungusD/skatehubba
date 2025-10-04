import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  Platform 
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

/**
 * SkateHubba Map Check-In MVP
 * Real location → Check-in button → Firebase save → Success confirmation
 */

const MapScreen = () => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'SkateHubba needs location access to show nearby skate spots and enable check-ins.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => Location.requestForegroundPermissionsAsync() }
          ]
        );
        setLoading(false);
        return;
      }

      // Get current location
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });

      setLoading(false);

    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Error', 'Failed to get your location. Please try again.');
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!location || !auth.currentUser) {
      Alert.alert('Error', 'Please make sure you\'re logged in and location is available.');
      return;
    }

    setChecking(true);

    try {
      // Add check-in to Firestore
      await addDoc(collection(db, 'checkins'), {
        uid: auth.currentUser.uid,
        lat: location.latitude,
        lng: location.longitude,
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        '🛹 Checked in!',
        'Your session is live. Time to skate!',
        [{ text: 'Let\'s Go! 🚀', style: 'default' }]
      );

    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to check in. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>🗺️ Getting Location...</Text>
        <Text style={styles.loadingSubtext}>Requesting permission</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>📍 Location Required</Text>
        <Text style={styles.errorSubtext}>SkateHubba needs location access to work</Text>
        <TouchableOpacity style={styles.retryButton} onPress={requestLocationPermission}>
          <Text style={styles.retryButtonText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={location}
        showsUserLocation={true}
        showsMyLocationButton={false}
        mapType="standard"
      >
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude
          }}
          title="You are here"
          description="Ready to check in?"
          pinColor="#ff6a00"
        />
      </MapView>

      <TouchableOpacity 
        style={[styles.checkinButton, checking && styles.checkinButtonLoading]}
        onPress={handleCheckIn}
        disabled={checking}
      >
        <Text style={styles.checkinButtonText}>
          {checking ? '📍 Checking In...' : '� Check In Here'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#ff6a00',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  loadingSubtext: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.7,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#ff6a00',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtext: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: '#ff6a00',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  map: {
    flex: 1,
  },
  checkinButton: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: '#ff6a00',
    paddingVertical: 20,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  checkinButtonLoading: {
    backgroundColor: '#cc5500',
  },
  checkinButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default MapScreen;