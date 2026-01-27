import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Spot } from '@/types';
import * as Location from 'expo-location';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { showMessage } from 'react-native-flash-message';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [showAddSpotModal, setShowAddSpotModal] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const { user, isAuthenticated, checkAuth } = useRequireAuth();

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

  const handleAddSpot = () => {
    if (!checkAuth({ message: 'Sign in to add spots' })) return;
    setShowAddSpotModal(true);
  };

  const handleCheckIn = (spot: Spot) => {
    if (!checkAuth({ message: 'Sign in to check in' })) return;
    showMessage({
      message: 'Checked In!',
      description: `You're now at ${spot.name}`,
      type: 'success',
      duration: 2000,
    });
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading spots...</Text>
        </View>
      ) : (
        <>
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
                onCalloutPress={() => setSelectedSpot(spot)}
              />
            ))}
          </MapView>

          {/* Floating Action Buttons */}
          <View style={styles.fabContainer}>
            <TouchableOpacity
              style={styles.fab}
              onPress={handleAddSpot}
              accessibilityLabel="Add new skate spot"
            >
              <Ionicons name="add" size={28} color={SKATE.colors.white} />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Difficulty</Text>
            <View style={styles.legendItems}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#34c759' }]} />
                <Text style={styles.legendText}>Beginner</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#ff9500' }]} />
                <Text style={styles.legendText}>Intermediate</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#ff3b30' }]} />
                <Text style={styles.legendText}>Advanced</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#ff6600' }]} />
                <Text style={styles.legendText}>Legendary</Text>
              </View>
            </View>
          </View>

          {/* Spot Detail Modal */}
          {selectedSpot && (
            <Modal
              visible={!!selectedSpot}
              transparent
              animationType="slide"
              onRequestClose={() => setSelectedSpot(null)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <TouchableOpacity
                    style={styles.modalClose}
                    onPress={() => setSelectedSpot(null)}
                  >
                    <Ionicons name="close" size={24} color={SKATE.colors.white} />
                  </TouchableOpacity>

                  <Text style={styles.modalTitle}>{selectedSpot.name}</Text>
                  <Text style={styles.modalDescription}>{selectedSpot.description}</Text>

                  <View style={styles.modalDifficulty}>
                    <View style={[styles.legendDot, { backgroundColor: getDifficultyColor(selectedSpot.difficulty) }]} />
                    <Text style={styles.modalDifficultyText}>
                      {selectedSpot.difficulty.charAt(0).toUpperCase() + selectedSpot.difficulty.slice(1)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.checkInButton}
                    onPress={() => {
                      handleCheckIn(selectedSpot);
                      setSelectedSpot(null);
                    }}
                  >
                    <Ionicons name="location" size={20} color={SKATE.colors.white} />
                    <Text style={styles.checkInButtonText}>Check In Here</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {/* Add Spot Modal */}
          <Modal
            visible={showAddSpotModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowAddSpotModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setShowAddSpotModal(false)}
                >
                  <Ionicons name="close" size={24} color={SKATE.colors.white} />
                </TouchableOpacity>

                <Text style={styles.modalTitle}>Add New Spot</Text>
                <Text style={styles.modalDescription}>
                  This feature is coming soon! You'll be able to add new skate spots to share with the community.
                </Text>

                <TouchableOpacity
                  style={[styles.checkInButton, { backgroundColor: SKATE.colors.gray }]}
                  onPress={() => setShowAddSpotModal(false)}
                >
                  <Text style={styles.checkInButtonText}>Got It</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
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
    backgroundColor: SKATE.colors.ink,
  },
  loadingText: {
    color: SKATE.colors.white,
    fontSize: 16,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 100,
    right: SKATE.spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SKATE.colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  legend: {
    position: 'absolute',
    bottom: SKATE.spacing.lg,
    left: SKATE.spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
  },
  legendTitle: {
    color: SKATE.colors.white,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: SKATE.spacing.sm,
  },
  legendItems: {
    gap: SKATE.spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SKATE.spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: SKATE.colors.lightGray,
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: SKATE.colors.grime,
    borderTopLeftRadius: SKATE.borderRadius.lg,
    borderTopRightRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xl,
    paddingBottom: 40,
  },
  modalClose: {
    position: 'absolute',
    top: SKATE.spacing.lg,
    right: SKATE.spacing.lg,
    zIndex: 1,
  },
  modalTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SKATE.spacing.md,
    marginTop: SKATE.spacing.lg,
  },
  modalDescription: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: SKATE.spacing.lg,
  },
  modalDifficulty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.xl,
  },
  modalDifficultyText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
  },
  checkInButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
