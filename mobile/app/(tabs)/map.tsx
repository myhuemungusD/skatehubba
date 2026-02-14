import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Spot } from "@/types";
import * as Location from "expo-location";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { showMessage } from "react-native-flash-message";
import { AddSpotModal } from "@/components/AddSpotModal";
import { MapSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";

function MapScreenContent() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [showAddSpotModal, setShowAddSpotModal] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const { isAuthenticated, checkAuth } = useRequireAuth();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const location = await Location.getCurrentPositionAsync({});
      setLocation(location);
    })();
  }, []);

  const { data: spots, isLoading } = useQuery({
    queryKey: ["/api/spots"],
    queryFn: () => apiRequest<Spot[]>("/api/spots"),
    enabled: isAuthenticated,
  });

  const handleAddSpot = () => {
    if (!checkAuth({ message: "Sign in to add spots" })) return;
    setShowAddSpotModal(true);
  };

  const handleCheckIn = async (spot: Spot) => {
    if (!checkAuth({ message: "Sign in to check in" })) return;

    if (!location) {
      showMessage({
        message: "Location Required",
        description: "Turn on location services to verify your check-in.",
        type: "warning",
        duration: 2000,
      });
      return;
    }

    // Calculate distance to spot (Haversine formula)
    const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371; // Earth's radius in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c * 1000; // distance in meters
    };

    const distance = calculateDistance(
      location.coords.latitude,
      location.coords.longitude,
      spot.lat,
      spot.lng
    );

    // Check if user is within 100 meters of the spot
    if (distance > 100) {
      showMessage({
        message: "Too Far Away",
        description: `You need to be within 100m of ${spot.name} to check in. You're ${Math.round(distance)}m away.`,
        type: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      const nonce = crypto.randomUUID();
      const data = await apiRequest<{ success: boolean; message?: string }>("/api/spots/check-in", {
        method: "POST",
        body: JSON.stringify({
          spotId: spot.id,
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy,
          nonce,
        }),
      });

      if (data.success) {
        showMessage({
          message: "✅ Check-in Confirmed!",
          description: `You're now checked in at ${spot.name}`,
          type: "success",
          duration: 2000,
        });
      } else {
        throw new Error(data.message || "Check-in failed");
      }
    } catch (error) {
      showMessage({
        message: "Check-in Failed",
        description: error instanceof Error ? error.message : "Unable to check in right now.",
        type: "danger",
        duration: 2000,
      });
    }
  };

  // Unauthenticated users are redirected to sign-in by the root layout guard.
  if (!isAuthenticated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  return (
    <View testID="map-screen" style={styles.container}>
      {isLoading ? (
        <MapSkeleton />
      ) : (
        <>
          <MapView
            testID="map-view"
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
                  latitude: spot.lat,
                  longitude: spot.lng,
                }}
                title={spot.name}
                description={spot.description ?? undefined}
                pinColor={getTierColor(spot.tier)}
                accessibilityLabel={`${spot.name} skate spot, ${spot.tier ?? "bronze"} tier`}
                onCalloutPress={() => setSelectedSpot(spot)}
              />
            ))}
          </MapView>

          {/* Floating Action Buttons */}
          <View style={styles.fabContainer}>
            <TouchableOpacity
              testID="map-add-spot"
              style={styles.fab}
              onPress={handleAddSpot}
              accessibilityLabel="Add new skate spot"
            >
              <Ionicons name="add" size={28} color={SKATE.colors.white} />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View testID="map-legend" style={styles.legend}>
            <Text style={styles.legendTitle}>Tier</Text>
            <View style={styles.legendItems}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#cd7f32" }]} />
                <Text style={styles.legendText}>Bronze</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#c0c0c0" }]} />
                <Text style={styles.legendText}>Silver</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#ffd700" }]} />
                <Text style={styles.legendText}>Gold</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#ff6600" }]} />
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
                  <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedSpot(null)}>
                    <Ionicons name="close" size={24} color={SKATE.colors.white} />
                  </TouchableOpacity>

                  <Text testID="map-spot-title" style={styles.modalTitle}>
                    {selectedSpot.name}
                  </Text>
                  <Text style={styles.modalDescription}>{selectedSpot.description ?? ""}</Text>

                  <View style={styles.modalDifficulty}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: getTierColor(selectedSpot.tier) },
                      ]}
                    />
                    <Text style={styles.modalDifficultyText}>
                      {(() => {
                        const tierValue = selectedSpot.tier ?? "bronze";
                        return tierValue.charAt(0).toUpperCase() + tierValue.slice(1);
                      })()}
                    </Text>
                  </View>

                  <TouchableOpacity
                    testID="map-check-in"
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
          <AddSpotModal
            isOpen={showAddSpotModal}
            onClose={() => setShowAddSpotModal(false)}
            userLocation={
              location
                ? {
                    lat: location.coords.latitude,
                    lng: location.coords.longitude,
                    accuracy: location.coords.accuracy ?? undefined,
                  }
                : null
            }
          />
        </>
      )}
    </View>
  );
}

export default function MapScreen() {
  return (
    <ScreenErrorBoundary screenName="Map">
      <MapScreenContent />
    </ScreenErrorBoundary>
  );
}

function getTierColor(tier: Spot["tier"]): string {
  switch (tier) {
    case "bronze":
      return "#cd7f32";
    case "silver":
      return "#c0c0c0";
    case "gold":
      return "#ffd700";
    case "legendary":
      return "#ff6600";
    default:
      return "#cd7f32"; // Default to bronze
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: SKATE.colors.ink,
  },
  fabContainer: {
    position: "absolute",
    bottom: 100,
    right: SKATE.spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SKATE.colors.orange,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  legend: {
    position: "absolute",
    bottom: SKATE.spacing.lg,
    left: SKATE.spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
  },
  legendTitle: {
    color: SKATE.colors.white,
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: SKATE.spacing.sm,
  },
  legendItems: {
    gap: SKATE.spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: SKATE.colors.grime,
    borderTopLeftRadius: SKATE.borderRadius.lg,
    borderTopRightRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xl,
    paddingBottom: 40,
  },
  modalClose: {
    position: "absolute",
    top: SKATE.spacing.lg,
    right: SKATE.spacing.lg,
    zIndex: 1,
  },
  modalTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: "bold",
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
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.xl,
  },
  modalDifficultyText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  checkInButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
  },
  checkInButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
});
