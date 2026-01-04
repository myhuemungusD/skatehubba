import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Spot } from '@/types';
import * as Location from 'expo-location';
import { useState, useEffect } from 'react';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setLocation(location);
    })();
  }, []);

  const { data: spots, isLoading } = useQuery({
    queryKey: ['/api/spots'],
    queryFn: () => apiRequest('/api/spots'),
  });

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading spots...</Text>
        </View>
      ) : (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location?.coords.latitude || 37.7749,
            longitude: location?.coords.longitude || -122.4194,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          showsUserLocation
          showsMyLocationButton
        >
          {spots?.map((spot: Spot) => (
            <Marker
              key={spot.id}
              coordinate={{
                latitude: spot.latitude,
                longitude: spot.longitude,
              }}
              title={spot.name}
              description={spot.description}
              pinColor={getDifficultyColor(spot.difficulty)}
              accessibilityLabel={`${spot.name} skate spot, ${spot.difficulty} difficulty`}
            />
          ))}
        </MapView>
      )}
    </View>
  );
}

function getDifficultyColor(difficulty: Spot['difficulty']): string {
  switch (difficulty) {
    case 'beginner': return '#34c759';
    case 'intermediate': return '#ff9500';
    case 'advanced': return '#ff3b30';
    case 'legendary': return '#ff6600';
    default: return '#999';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
});
