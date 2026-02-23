import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Spot } from "@/types";
import * as Location from "expo-location";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { showMessage } from "react-native-flash-message";
import { AddSpotModal } from "@/components/AddSpotModal";
import { MapSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { isExpoGo } from "@/lib/isExpoGo";
import { getTierColor } from "@/lib/getTierColor";
import { SpotDetailModal } from "@/components/map/SpotDetailModal";
import { SpotListFallback } from "@/components/map/SpotListFallback";
import { MapLegend } from "@/components/map/MapLegend";

// Minimal prop types for conditionally-loaded native map components
interface NativeMapViewProps {
  testID?: string;
  style?: unknown;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  children?: React.ReactNode;
}

interface NativeMarkerProps {
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
  pinColor?: string;
  accessibilityLabel?: string;
  onCalloutPress?: () => void;
}

// react-native-maps requires native code unavailable in Expo Go
let MapView: React.ComponentType<NativeMapViewProps> | null = null;
let Marker: React.ComponentType<NativeMarkerProps> | null = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require("react-native-maps");
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {
    // Native module not available
  }
}

/** Haversine distance in meters between two lat/lng points. */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
  return R * c * 1000;
}

function MapScreenContent() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [showAddSpotModal, setShowAddSpotModal] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const { isAuthenticated, checkAuth } = useRequireAuth();

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      } catch {
        showMessage({
          message: "Location Unavailable",
          description: "Could not determine your location. Check-in requires location.",
          type: "warning",
          duration: 3000,
        });
      }
    })();
  }, []);

  const { data: spots, isLoading } = useQuery({
    queryKey: ["/api/spots"],
    queryFn: () => apiRequest<Spot[]>("/api/spots"),
    enabled: isAuthenticated,
  });

  const handleAddSpot = useCallback(() => {
    if (!checkAuth({ message: "Sign in to add spots" })) return;
    setShowAddSpotModal(true);
  }, [checkAuth]);

  const handleCheckIn = useCallback(
    async (spot: Spot) => {
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

      const distance = calculateDistance(
        location.coords.latitude,
        location.coords.longitude,
        spot.lat,
        spot.lng
      );

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
        const data = await apiRequest<{ success: boolean; message?: string }>(
          "/api/spots/check-in",
          {
            method: "POST",
            body: JSON.stringify({
              spotId: spot.id,
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              accuracy: location.coords.accuracy,
              nonce,
            }),
          }
        );

        if (data.success) {
          showMessage({
            message: "Check-in Confirmed!",
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
    },
    [checkAuth, location]
  );

  const handleSelectSpot = useCallback((spot: Spot) => {
    setSelectedSpot(spot);
  }, []);

  const handleCloseSpotDetail = useCallback(() => {
    setSelectedSpot(null);
  }, []);

  const handleCloseAddSpot = useCallback(() => {
    setShowAddSpotModal(false);
  }, []);

  // Unauthenticated users are redirected to sign-in by the root layout guard.
  if (!isAuthenticated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  const userLocation = location
    ? {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy ?? undefined,
      }
    : null;

  // Expo Go fallback: show spots as a list instead of a native map
  if (!MapView || !Marker) {
    return (
      <View testID="map-screen" style={styles.container}>
        <SpotListFallback
          spots={spots}
          isLoading={isLoading}
          onAddSpot={handleAddSpot}
          onSelectSpot={handleSelectSpot}
        />

        <SpotDetailModal
          spot={selectedSpot}
          onClose={handleCloseSpotDetail}
          onCheckIn={handleCheckIn}
        />

        <AddSpotModal
          isOpen={showAddSpotModal}
          onClose={handleCloseAddSpot}
          userLocation={userLocation}
        />
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

          {/* Floating Action Button */}
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

          <MapLegend />

          <SpotDetailModal
            spot={selectedSpot}
            onClose={handleCloseSpotDetail}
            onCheckIn={handleCheckIn}
          />

          <AddSpotModal
            isOpen={showAddSpotModal}
            onClose={handleCloseAddSpot}
            userLocation={userLocation}
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
});
