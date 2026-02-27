import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation as NavigationIcon, Plus, Eye, Loader2 } from "lucide-react";
import { type Spot } from "@shared/schema";
import { AddSpotModal } from "../components/map/AddSpotModal";
import { SpotDetailModal } from "../components/map/SpotDetailModal";
import { SpotMap } from "../components/SpotMap";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { useToast } from "../hooks/use-toast";
import { useGeolocation } from "../hooks/useGeolocation";
import { useAccountTier } from "../hooks/useAccountTier";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { calculateDistance, getProximity } from "../lib/distance";
import { DEMO_SPOTS, isDemoSpot } from "../lib/demo-data";

// ============================================================================
// TYPES
// ============================================================================

type SpotWithDistance = Spot & {
  distance: number | null;
  proximity: "here" | "nearby" | "far" | null;
};

type UserLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

type UserLocationSimple = {
  lat: number;
  lng: number;
  accuracy?: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function MapPage() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPaidOrPro } = useAccountTier();
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [isAddSpotOpen, setIsAddSpotOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");

  // Handle return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    if (upgrade === "success") {
      toast({
        title: "Welcome to Premium!",
        description: "All features are now unlocked. Go skate.",
        duration: 6000,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tier"] });
      const url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname + url.search);
    } else if (upgrade === "cancelled") {
      toast({
        title: "Payment cancelled",
        description: "No worries — you can upgrade anytime.",
        duration: 5000,
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally runs once on mount; URL params are read only at page load to handle Stripe redirect state and should not re-run on subsequent renders

  // ---------------------------------------------------------------------------
  // Geolocation
  // ---------------------------------------------------------------------------
  const geolocation = useGeolocation(true);

  const userLocation = useMemo<UserLocation | null>(() => {
    if (geolocation.latitude === null || geolocation.longitude === null) {
      return null;
    }
    return {
      lat: geolocation.latitude,
      lng: geolocation.longitude,
      accuracy: geolocation.accuracy,
    };
  }, [geolocation.latitude, geolocation.longitude, geolocation.accuracy]);

  const userLocationSimple = useMemo<UserLocationSimple | null>(() => {
    if (!userLocation) return null;
    return {
      lat: userLocation.lat,
      lng: userLocation.lng,
      accuracy: userLocation.accuracy ?? undefined,
    };
  }, [userLocation]);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const hasDiscoveredRef = useRef(false);

  const {
    data: apiSpots,
    isLoading: isSpotsLoading,
    isError: isSpotsError,
  } = useQuery<Spot[]>({
    queryKey: ["/api/spots"],
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const { spots, isFallback: isUsingDemoSpots } = useMemo(() => {
    if (apiSpots && apiSpots.length > 0) return { spots: apiSpots, isFallback: false };
    if (isSpotsError || (!isSpotsLoading && (!apiSpots || apiSpots.length === 0))) {
      return { spots: DEMO_SPOTS, isFallback: true };
    }
    return { spots: [] as Spot[], isFallback: false };
  }, [apiSpots, isSpotsError, isSpotsLoading]);

  useEffect(() => {
    if (
      hasDiscoveredRef.current ||
      geolocation.latitude === null ||
      geolocation.longitude === null ||
      geolocation.status !== "ready"
    ) {
      return;
    }

    hasDiscoveredRef.current = true;
    const lat = geolocation.latitude;
    const lng = geolocation.longitude;

    fetch(`/api/spots/discover?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.added > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
        }
      })
      .catch(() => {
        // Discovery is best-effort
      });
  }, [geolocation.latitude, geolocation.longitude, geolocation.status, queryClient]);

  // ---------------------------------------------------------------------------
  // Memoized Computations
  // ---------------------------------------------------------------------------

  const spotsWithDistance = useMemo<SpotWithDistance[]>(() => {
    if (!userLocation) {
      return spots.map((spot) => ({
        ...spot,
        distance: null,
        proximity: null,
      }));
    }

    return spots.map((spot) => {
      const distance = calculateDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng);
      return {
        ...spot,
        distance,
        proximity: getProximity(distance),
      };
    });
  }, [spots, userLocation]);

  // Pre-compute check-in count to avoid .filter() in render
  const checkInRangeCount = useMemo(() => {
    return spotsWithDistance.filter((s) => s.proximity === "here").length;
  }, [spotsWithDistance]);

  const selectedSpot = useMemo<SpotWithDistance | null>(() => {
    if (selectedSpotId === null) return null;
    return spotsWithDistance.find((s) => s.id === selectedSpotId) ?? null;
  }, [selectedSpotId, spotsWithDistance]);

  // ---------------------------------------------------------------------------
  // Stable Callbacks
  // ---------------------------------------------------------------------------

  const handleSelectSpot = useCallback((spotId: number) => {
    setSelectedSpotId(spotId);
  }, []);

  const handleCloseSpotDetail = useCallback(() => {
    setSelectedSpotId(null);
  }, []);

  const handleOpenAddSpot = useCallback(() => {
    if (!isPaidOrPro) {
      setUpgradeFeature("Add Spots");
      setIsUpgradeOpen(true);
      return;
    }
    setIsAddSpotOpen(true);
  }, [isPaidOrPro]);

  const handleCloseAddSpot = useCallback(() => {
    setIsAddSpotOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  const hasShownBrowseToastRef = useRef(false);
  useEffect(() => {
    if (geolocation.status === "browse" && !hasShownBrowseToastRef.current) {
      hasShownBrowseToastRef.current = true;
      toast({
        title: "Explore Mode",
        description: "Browse spots around the world. Enable location to check in.",
        duration: 4000,
      });
    }
  }, [geolocation.status, toast]);

  // ---------------------------------------------------------------------------
  // Status Message
  // ---------------------------------------------------------------------------

  const statusMessage = useMemo(() => {
    if (isSpotsLoading) {
      return (
        <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading spots...
        </p>
      );
    }

    if (isUsingDemoSpots) {
      return (
        <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
          <MapPin className="w-3 h-3" />
          Showing iconic spots worldwide
        </p>
      );
    }

    if (geolocation.status === "ready") {
      if (spotsWithDistance.length === 0) {
        return (
          <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            No spots nearby yet. Add one!
          </p>
        );
      }
      return (
        <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
          <NavigationIcon className="w-3 h-3" />
          {checkInRangeCount} spot{checkInRangeCount !== 1 ? "s" : ""} in check-in range
        </p>
      );
    }

    if (geolocation.status === "locating") {
      return (
        <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Finding your location...
        </p>
      );
    }

    return (
      <p className="text-sm text-blue-400 flex items-center gap-1 mt-1">
        <Eye className="w-3 h-3" />
        Explore mode — tap a spot for details
      </p>
    );
  }, [
    isSpotsLoading,
    isUsingDemoSpots,
    geolocation.status,
    spotsWithDistance.length,
    checkInRangeCount,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <main className="flex-1 relative min-h-0" role="main" aria-label="Skate spots map">
        {isSpotsLoading ? (
          <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-[#ff6a00] mx-auto mb-4" />
              <p className="text-gray-400">Loading map...</p>
            </div>
          </div>
        ) : (
          <SpotMap
            spots={spotsWithDistance}
            userLocation={userLocation}
            selectedSpotId={selectedSpotId}
            onSelectSpot={handleSelectSpot}
          />
        )}

        {/* Add Spot FAB */}
        <div className="absolute bottom-24 right-4 z-[1000] pb-safe">
          <Button
            onClick={handleOpenAddSpot}
            className="shadow-lg bg-[#ff6a00] hover:bg-[#ff6a00]/90 text-white font-semibold h-14 px-6"
            data-testid="button-add-spot-mode"
            aria-label="Add a new skate spot"
          >
            <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
            Add Spot
          </Button>
        </div>

        <AddSpotModal
          isOpen={isAddSpotOpen}
          onClose={handleCloseAddSpot}
          userLocation={userLocationSimple}
          geolocationStatus={geolocation.status}
          geolocationErrorCode={geolocation.errorCode}
        />

        {/* Floating Header */}
        <header className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
          <Card className="bg-black/80 border-gray-600 backdrop-blur-md pointer-events-auto">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#fafafa] flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#ff6a00]" aria-hidden="true" />
                    Skate Spots
                    {!isSpotsLoading && spots.length > 0 && (
                      <span className="text-sm font-normal text-gray-500">({spots.length})</span>
                    )}
                  </h1>
                  {statusMessage}
                </div>
              </div>
            </CardContent>
          </Card>
        </header>
      </main>

      <SpotDetailModal
        spotId={selectedSpotId}
        initialSpot={selectedSpot}
        isOpen={selectedSpotId !== null}
        onClose={handleCloseSpotDetail}
        userLocation={userLocationSimple}
        readOnly={selectedSpotId !== null && isDemoSpot({ id: selectedSpotId })}
      />

      <UpgradePrompt
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
        feature={upgradeFeature}
      />
    </div>
  );
}
