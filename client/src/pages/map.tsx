import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation as NavigationIcon, Plus, Eye, Search, Loader2 } from "lucide-react";
import { type Spot, SPOT_TYPES } from "@shared/schema";
import { AddSpotModal } from "../components/map/AddSpotModal";
import { SpotDetailModal } from "../components/map/SpotDetailModal";
import { SpotMap } from "../components/SpotMap";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useToast } from "../hooks/use-toast";
import { useGeolocation } from "../hooks/useGeolocation";
import { useAccountTier } from "../hooks/useAccountTier";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { calculateDistance, getProximity } from "../lib/distance";

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
};

// ============================================================================
// DEMO FALLBACK SPOTS
// Real iconic skate spots shown when the API is unavailable, so the map always
// looks alive during demos. These are well-known public skateparks.
// ============================================================================

const DEMO_SPOTS: Spot[] = [
  {
    id: -1,
    name: "Hubba Hideout",
    description:
      "The legendary San Francisco ledge spot. Iconic for ledge tricks and part of skate history.",
    spotType: "ledge",
    tier: "legendary",
    lat: 37.7849,
    lng: -122.4094,
    address: "1 Dr Carlton B Goodlett Pl",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 342,
    rating: 4.9,
    ratingCount: 127,
  },
  {
    id: -2,
    name: "MACBA",
    description:
      "Museum of Contemporary Art plaza. One of the most famous street spots in the world.",
    spotType: "street",
    tier: "legendary",
    lat: 41.3833,
    lng: 2.17,
    address: "Plaça dels Àngels, 1",
    city: "Barcelona",
    state: null,
    country: "Spain",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 518,
    rating: 4.8,
    ratingCount: 203,
  },
  {
    id: -3,
    name: "Venice Beach Skatepark",
    description: "Iconic oceanside skatepark with snake run, bowls, and street section.",
    spotType: "park",
    tier: "gold",
    lat: 33.985,
    lng: -118.4725,
    address: "1800 Ocean Front Walk",
    city: "Los Angeles",
    state: "CA",
    country: "USA",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 891,
    rating: 4.7,
    ratingCount: 314,
  },
  {
    id: -4,
    name: "LES Coleman Park",
    description: "Lower East Side community skatepark under the Manhattan Bridge.",
    spotType: "park",
    tier: "gold",
    lat: 40.7138,
    lng: -73.9903,
    address: "Pike St & Monroe St",
    city: "New York",
    state: "NY",
    country: "USA",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 267,
    rating: 4.5,
    ratingCount: 89,
  },
  {
    id: -5,
    name: "Burnside Skatepark",
    description: "DIY legend under the Burnside Bridge. Built by skaters, for skaters.",
    spotType: "diy",
    tier: "legendary",
    lat: 45.5228,
    lng: -122.6654,
    address: "E Burnside St & SE 2nd Ave",
    city: "Portland",
    state: "OR",
    country: "USA",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 445,
    rating: 4.8,
    ratingCount: 167,
  },
  {
    id: -6,
    name: "FDR Skatepark",
    description: "Massive DIY skatepark under I-95 in Philadelphia. Deep bowls and transitions.",
    spotType: "diy",
    tier: "gold",
    lat: 39.9131,
    lng: -75.1821,
    address: "Pattison Ave & S Broad St",
    city: "Philadelphia",
    state: "PA",
    country: "USA",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 334,
    rating: 4.6,
    ratingCount: 112,
  },
  {
    id: -7,
    name: "Southbank Undercroft",
    description: "Historic concrete banks and ledges beneath the National Theatre in London.",
    spotType: "street",
    tier: "legendary",
    lat: 51.5065,
    lng: -0.1164,
    address: "Belvedere Rd",
    city: "London",
    state: null,
    country: "UK",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 612,
    rating: 4.7,
    ratingCount: 241,
  },
  {
    id: -8,
    name: "Lincoln Memorial Steps",
    description: "Classic East Coast gap and stair set. A DC staple since the 90s.",
    spotType: "stairs",
    tier: "gold",
    lat: 38.8893,
    lng: -77.0502,
    address: "2 Lincoln Memorial Cir NW",
    city: "Washington",
    state: "DC",
    country: "USA",
    photoUrl: null,
    thumbnailUrl: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verified: true,
    isActive: true,
    checkInCount: 156,
    rating: 4.3,
    ratingCount: 58,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function MapPage() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const { toast } = useToast();
  const { isPaidOrPro } = useAccountTier();
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [isAddSpotOpen, setIsAddSpotOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Geolocation
  // ---------------------------------------------------------------------------
  const geolocation = useGeolocation(true);

  // Memoized user location - prevents creating new object references on every render
  // This is critical for preventing SpotMap from re-rendering unnecessarily
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

  // Simplified location for modals (don't need accuracy)
  const userLocationSimple = useMemo<UserLocationSimple | null>(() => {
    if (!userLocation) return null;
    return { lat: userLocation.lat, lng: userLocation.lng };
  }, [userLocation]);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const queryClient = useQueryClient();
  const hasDiscoveredRef = useRef(false);

  const {
    data: apiSpots,
    isLoading: isSpotsLoading,
    isError: isSpotsError,
  } = useQuery<Spot[]>({
    queryKey: ["/api/spots"],
    staleTime: 30_000, // Consider fresh for 30 seconds
    gcTime: 5 * 60_000, // Keep in garbage collection for 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Use API spots when available, fall back to demo spots when API fails
  const spots = useMemo(() => {
    if (apiSpots && apiSpots.length > 0) return apiSpots;
    if (isSpotsError || (!isSpotsLoading && (!apiSpots || apiSpots.length === 0))) {
      return DEMO_SPOTS;
    }
    return [];
  }, [apiSpots, isSpotsError, isSpotsLoading]);

  const isUsingDemoSpots = spots === DEMO_SPOTS;

  // Discover nearby skateparks from OpenStreetMap when user location is available
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
          // New spots were discovered - refresh the spots list
          queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
        }
      })
      .catch(() => {
        // Discovery is best-effort - don't block the map experience
      });
  }, [geolocation.latitude, geolocation.longitude, geolocation.status, queryClient]);

  // ---------------------------------------------------------------------------
  // Memoized Computations
  // ---------------------------------------------------------------------------

  // CRITICAL: Distance calculation wrapped in useMemo
  // Without this, we recalculate distances for ALL spots on EVERY render
  // With 1000 spots, that's 1000 haversine calculations per frame = battery death
  const spotsWithDistance = useMemo<SpotWithDistance[]>(() => {
    if (!userLocation) {
      // No location available - return spots with null distance
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

  // Filter spots based on search and type
  const filteredSpots = useMemo(() => {
    let result = spotsWithDistance;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
      );
    }

    if (activeTypeFilter) {
      result = result.filter((s) => s.spotType === activeTypeFilter);
    }

    return result;
  }, [spotsWithDistance, searchQuery, activeTypeFilter]);

  // Pre-compute check-in count to avoid .filter() in render
  const checkInRangeCount = useMemo(() => {
    return filteredSpots.filter((s) => s.proximity === "here").length;
  }, [filteredSpots]);

  // Selected spot from existing data - avoids redundant API fetch in modal
  const selectedSpot = useMemo<SpotWithDistance | null>(() => {
    if (selectedSpotId === null) return null;
    return spotsWithDistance.find((s) => s.id === selectedSpotId) ?? null;
  }, [selectedSpotId, spotsWithDistance]);

  // ---------------------------------------------------------------------------
  // Stable Callbacks - prevents child component re-renders
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

  // Show a single friendly toast when entering browse mode (geolocation unavailable)
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
  // Render Helpers
  // ---------------------------------------------------------------------------

  const renderStatusMessage = useCallback(() => {
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
      if (filteredSpots.length === 0 && !searchQuery && !activeTypeFilter) {
        return (
          <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
            <Search className="w-3 h-3" />
            No spots nearby yet. Drop a pin to add one!
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

    // Browse mode (default for all geolocation failures)
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
    filteredSpots.length,
    checkInRangeCount,
    searchQuery,
    activeTypeFilter,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Full-screen map */}
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
            spots={filteredSpots}
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

        {/* Add Spot Modal */}
        <AddSpotModal
          isOpen={isAddSpotOpen}
          onClose={handleCloseAddSpot}
          userLocation={userLocationSimple}
        />

        {/* Floating Header */}
        <header className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
          <Card className="bg-black/80 border-gray-600 backdrop-blur-md pointer-events-auto">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-2xl font-bold text-[#fafafa] flex items-center gap-2">
                    <MapPin className="w-6 h-6 text-[#ff6a00]" aria-hidden="true" />
                    Skate Spots
                    {!isSpotsLoading && spots.length > 0 && (
                      <span className="text-sm font-normal text-gray-500">({spots.length})</span>
                    )}
                  </h1>
                  {renderStatusMessage()}
                </div>
              </div>

              {/* Search and Filters */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search spots..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-lg bg-neutral-900/50 border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ff6a00] focus:ring-1 focus:ring-[#ff6a00] transition-all text-sm"
                    data-testid="input-spot-search"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                  <Badge
                    variant={activeTypeFilter === null ? "default" : "outline"}
                    className={`cursor-pointer whitespace-nowrap ${activeTypeFilter === null ? "bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90" : "text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}
                    onClick={() => setActiveTypeFilter(null)}
                  >
                    All
                  </Badge>
                  {SPOT_TYPES.map((type) => (
                    <Badge
                      key={type}
                      variant={activeTypeFilter === type ? "default" : "outline"}
                      className={`cursor-pointer whitespace-nowrap capitalize ${activeTypeFilter === type ? "bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90" : "text-gray-400 border-gray-700 hover:text-white hover:border-gray-500"}`}
                      onClick={() => setActiveTypeFilter(type === activeTypeFilter ? null : type)}
                      data-testid={`filter-${type}`}
                    >
                      {type.replace("-", " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </header>
      </main>

      {/* Spot Detail Modal - passes existing data to eliminate redundant fetch */}
      <SpotDetailModal
        spotId={selectedSpotId}
        initialSpot={selectedSpot}
        isOpen={selectedSpotId !== null}
        onClose={handleCloseSpotDetail}
        userLocation={userLocationSimple}
      />

      {/* Upgrade Prompt for free users */}
      <UpgradePrompt
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
        feature={upgradeFeature}
      />
    </div>
  );
}
