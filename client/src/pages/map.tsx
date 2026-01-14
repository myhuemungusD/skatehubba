import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Navigation as NavigationIcon, AlertCircle, Plus, Clock, Eye, Search, Loader2 } from 'lucide-react';
import { type Spot, SPOT_TYPES } from '@shared/schema';
import { AddSpotModal } from '../components/map/AddSpotModal';
import { SpotDetailModal } from '../components/map/SpotDetailModal';
import Navigation from '../components/Navigation';
import { SpotMap } from '../components/SpotMap';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useToast } from '../hooks/use-toast';
import { useGeolocation } from '../hooks/useGeolocation';
import { calculateDistance, getProximity } from '../lib/distance';

// ============================================================================
// TYPES
// ============================================================================

type SpotWithDistance = Spot & {
  distance: number | null;
  proximity: 'here' | 'nearby' | 'far' | null;
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
// CONSTANTS
// ============================================================================

/** Debounce time for showing error toasts (prevents spam) */
const TOAST_DEBOUNCE_MS = 10_000;

// ============================================================================
// COMPONENT
// ============================================================================

export default function MapPage() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const { toast } = useToast();
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [isAddSpotOpen, setIsAddSpotOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  
  // Track last toast to prevent duplicate error notifications
  const lastToastRef = useRef<{ type: string; time: number } | null>(null);

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
  }, [userLocation?.lat, userLocation?.lng]);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const { 
    data: spots = [], 
    isLoading: isSpotsLoading,
    isError: isSpotsError,
    refetch: refetchSpots,
  } = useQuery<Spot[]>({
    queryKey: ['/api/spots'],
    staleTime: 30_000,        // Consider fresh for 30 seconds
    gcTime: 5 * 60_000,       // Keep in garbage collection for 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // ---------------------------------------------------------------------------
  // Memoized Computations
  // ---------------------------------------------------------------------------
  
  // CRITICAL: Distance calculation wrapped in useMemo
  // Without this, we recalculate distances for ALL spots on EVERY render
  // With 1000 spots, that's 1000 haversine calculations per frame = battery death
  const spotsWithDistance = useMemo<SpotWithDistance[]>(() => {
    if (!userLocation) {
      // No location available - return spots with null distance
      return spots.map(spot => ({
        ...spot,
        distance: null,
        proximity: null,
      }));
    }

    return spots.map(spot => {
      const distance = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        spot.lat,
        spot.lng
      );
      return {
        ...spot,
        distance,
        proximity: getProximity(distance),
      };
    });
  }, [spots, userLocation?.lat, userLocation?.lng]);

  // Filter spots based on search and type
  const filteredSpots = useMemo(() => {
    let result = spotsWithDistance;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.description?.toLowerCase().includes(q)
      );
    }

    if (activeTypeFilter) {
      result = result.filter(s => s.spotType === activeTypeFilter);
    }

    return result;
  }, [spotsWithDistance, searchQuery, activeTypeFilter]);

  // Pre-compute check-in count to avoid .filter() in render
  const checkInRangeCount = useMemo(() => {
    return filteredSpots.filter(s => s.proximity === 'here').length;
  }, [filteredSpots]);

  // Selected spot from existing data - avoids redundant API fetch in modal
  const selectedSpot = useMemo<SpotWithDistance | null>(() => {
    if (selectedSpotId === null) return null;
    return spotsWithDistance.find(s => s.id === selectedSpotId) ?? null;
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
    setIsAddSpotOpen(true);
  }, []);

  const handleCloseAddSpot = useCallback(() => {
    setIsAddSpotOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  
  // Debounced toast for geolocation errors - prevents spamming the user
  useEffect(() => {
    const now = Date.now();
    const lastToast = lastToastRef.current;
    
    // Skip if we recently showed a toast for this status type
    if (lastToast?.type === geolocation.status && now - lastToast.time < TOAST_DEBOUNCE_MS) {
      return;
    }

    if (geolocation.status === 'denied') {
      lastToastRef.current = { type: 'denied', time: now };
      toast({
        title: 'Location Access Denied',
        description: 'You can still browse spots, but check-ins require location access.',
        variant: 'destructive',
        duration: 8000,
      });
    } else if (geolocation.status === 'timeout') {
      lastToastRef.current = { type: 'timeout', time: now };
      toast({
        title: 'Location Timed Out',
        description: 'Getting your location took too long. Try again or browse without location.',
        duration: 6000,
      });
    } else if (geolocation.status === 'error' && geolocation.error) {
      lastToastRef.current = { type: 'error', time: now };
      toast({
        title: 'Location Unavailable',
        description: geolocation.error,
        duration: 5000,
      });
    }
  }, [geolocation.status, geolocation.error, toast]);

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

    if (isSpotsError) {
      return (
        <p className="text-sm text-red-400 flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3" />
          Failed to load spots
          <Button 
            variant="link" 
            size="sm" 
            onClick={() => refetchSpots()}
            className="text-red-400 underline p-0 h-auto ml-1"
          >
            Retry
          </Button>
        </p>
      );
    }

    switch (geolocation.status) {
      case 'ready':
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
            {checkInRangeCount} spot{checkInRangeCount !== 1 ? 's' : ''} in check-in range
          </p>
        );

      case 'locating':
        return (
          <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Finding your location...
          </p>
        );

      case 'browse':
        return (
          <p className="text-sm text-blue-400 flex items-center gap-1 mt-1">
            <Eye className="w-3 h-3" />
            Browse mode - check-ins disabled
          </p>
        );

      case 'denied':
        return (
          <p className="text-sm text-red-400 flex items-center gap-1 mt-1">
            <AlertCircle className="w-3 h-3" />
            Location denied
          </p>
        );

      case 'timeout':
        return (
          <p className="text-sm text-orange-400 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" />
            Location timed out
          </p>
        );

      case 'error':
        return (
          <p className="text-sm text-red-400 flex items-center gap-1 mt-1">
            <AlertCircle className="w-3 h-3" />
            Location unavailable
          </p>
        );

      default:
        return null;
    }
  }, [isSpotsLoading, isSpotsError, geolocation.status, filteredSpots.length, checkInRangeCount, refetchSpots, searchQuery, activeTypeFilter]);

  const showRetryButtons = geolocation.status === 'denied' || 
                           geolocation.status === 'timeout' || 
                           geolocation.status === 'error';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  
  return (
    <div className="h-dvh flex flex-col bg-[#181818] overflow-hidden">
      <Navigation />
      
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
            disabled={!userLocation}
            className="shadow-lg bg-[#ff6a00] hover:bg-[#ff6a00]/90 text-white font-semibold h-14 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-add-spot-mode"
            aria-label="Add a new skate spot at your current location"
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
                      <span className="text-sm font-normal text-gray-500">
                        ({spots.length})
                      </span>
                    )}
                  </h1>
                  {renderStatusMessage()}
                </div>
                
                {showRetryButtons && (
                  <div className="flex gap-2" role="group" aria-label="Location options">
                    <Button
                      onClick={geolocation.retry}
                      variant="outline"
                      size="sm"
                      className="border-[#ff6a00] text-[#ff6a00] hover:bg-[#ff6a00] hover:text-white"
                      data-testid="button-retry-location"
                    >
                      Retry
                    </Button>
                    <Button
                      onClick={geolocation.browseWithoutLocation}
                      variant="outline"
                      size="sm"
                      className="border-gray-500 text-gray-400 hover:bg-gray-700 hover:text-white"
                      data-testid="button-browse-mode"
                    >
                      Browse
                    </Button>
                  </div>
                )}
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
                    className={`cursor-pointer whitespace-nowrap ${activeTypeFilter === null ? 'bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90' : 'text-gray-400 border-gray-700 hover:text-white hover:border-gray-500'}`}
                    onClick={() => setActiveTypeFilter(null)}
                  >
                    All
                  </Badge>
                  {SPOT_TYPES.map((type) => (
                    <Badge
                      key={type}
                      variant={activeTypeFilter === type ? "default" : "outline"}
                      className={`cursor-pointer whitespace-nowrap capitalize ${activeTypeFilter === type ? 'bg-[#ff6a00] text-white hover:bg-[#ff6a00]/90' : 'text-gray-400 border-gray-700 hover:text-white hover:border-gray-500'}`}
                      onClick={() => setActiveTypeFilter(type === activeTypeFilter ? null : type)}
                      data-testid={`filter-${type}`}
                    >
                      {type.replace('-', ' ')}
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
    </div>
  );
}
