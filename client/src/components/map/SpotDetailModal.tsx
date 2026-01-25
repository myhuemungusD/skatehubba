import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Calendar,
  Users,
  Navigation,
  Share2,
  ExternalLink,
  X,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchSpotById, type SpotRecord } from "@/features/spots/spotService";
import { CheckInButton } from "@/features/checkins/CheckInButton";
import { usePresenceForSpot } from "@/features/presence/usePresenceForSpot";
import { SpotMiniMap } from "./SpotMiniMap";

// Labels with emojis for display
const SPOT_TYPE_LABELS: Record<string, string> = {
  rail: " Rail",
  ledge: " Ledge",
  stairs: " Stairs",
  gap: " Gap",
  plaza: " Plaza",
  shop: " Skate Shop",
  school: " School",
  park: " Skate Park",
  street: " Street Spot",
  other: " Other",
};

interface SpotDetailModalProps {
  spotId: string | null;
  /** Pass spot data directly to avoid redundant API fetch */
  initialSpot?: SpotRecord | null;
  isOpen: boolean;
  onClose: () => void;
  userLocation?: { lat: number; lng: number } | null;
}

export function SpotDetailModal({
  spotId,
  initialSpot,
  isOpen,
  onClose,
  userLocation,
}: SpotDetailModalProps) {
  const { toast } = useToast();

  // Only fetch if we don't have the spot data passed in
  // This eliminates the redundant round-trip when parent already has the data
  const {
    data: fetchedSpot,
    isLoading,
    error,
  } = useQuery<SpotRecord | null>({
    queryKey: ["spots", "detail", spotId],
    queryFn: () => (spotId ? fetchSpotById(spotId) : Promise.resolve(null)),
    enabled: isOpen && spotId !== null && !initialSpot,
    // Use initialSpot as initial data if available
    initialData: initialSpot ?? undefined,
  });

  // Use passed spot or fetched spot
  const spot = initialSpot ?? fetchedSpot;

  // Calculate distance if user location available
  const getDistance = () => {
    if (!userLocation || !spot) return null;

    const R = 6371; // Earth's radius in km
    const dLat = ((spot.location.lat - userLocation.lat) * Math.PI) / 180;
    const dLon = ((spot.location.lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((spot.location.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(1)} km`;
  };

  const handleShare = async () => {
    if (!spot) return;

    const shareData = {
      title: spot.name,
      text: `Check out ${spot.name} on SkateHubba!`,
      url: `${window.location.origin}/spots/${spot.id}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast({
          title: "Link copied!",
          description: "Share it with your crew.",
        });
      }
    } catch (error) {
      console.error("Failed to share spot:", error);
    }
  };

  const openInMaps = () => {
    if (!spot) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.location.lat},${spot.location.lng}`;
    window.open(url, "_blank");
  };

  const distance = getDistance();
  const { users: presenceUsers } = usePresenceForSpot(spot?.id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#ff6a00]" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p>Failed to load spot details</p>
            <Button variant="outline" onClick={() => onClose()} className="mt-4">
              Close
            </Button>
          </div>
        )}

        {spot && (
          <>
            {/* Header Image/Placeholder */}
            <div className="relative h-48 bg-gradient-to-br from-[#ff6a00]/30 to-neutral-800 flex items-center justify-center">
              {spot.photos?.[0]?.url ? (
                <img
                  src={spot.photos[0].url}
                  alt={spot.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-6xl"></div>
              )}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 transition"
              >
                <X className="w-5 h-5" />
              </button>

            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Title & Type */}
              <div>
                <DialogHeader>
                  <DialogTitle className="text-2xl text-white">{spot.name}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {spot.spotType && (
                    <Badge variant="secondary" className="bg-neutral-800 text-gray-300">
                      {SPOT_TYPE_LABELS[spot.spotType] || spot.spotType}
                    </Badge>
                  )}
                  {distance && (
                    <Badge variant="outline" className="border-neutral-700 text-gray-400">
                      <Navigation className="w-3 h-3 mr-1" />
                      {distance}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Description */}
              {spot.description && (
                <p className="text-gray-300 leading-relaxed">{spot.description}</p>
              )}

              {spot.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {spot.features.map((feature) => (
                    <Badge
                      key={feature}
                      variant="outline"
                      className="border-neutral-700 text-neutral-300"
                    >
                      {feature}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Users className="w-4 h-4" />
                    Check-ins
                  </div>
                  <div className="text-2xl font-bold text-white">{spot.stats.checkinsAll}</div>
                </div>
                <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Calendar className="w-4 h-4" />
                    Added
                  </div>
                  <div className="text-sm text-white">
                    {spot.createdAt ? spot.createdAt.toLocaleDateString() : "Recently"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-neutral-300">
                <Users className="h-4 w-4 text-yellow-400" />
                Skating here now: {presenceUsers.length}
              </div>

              {/* Location */}
              <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-[#ff6a00] mt-0.5" />
                  <div className="flex-1">
                    <div className="text-white">
                      {spot.city && spot.state
                        ? `${spot.city}, ${spot.state}`
                        : spot.city || spot.state || spot.country || "Location on map"}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {spot.location.lat.toFixed(6)}, {spot.location.lng.toFixed(6)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openInMaps}
                    className="text-[#ff6a00] hover:text-[#ff6a00]/80"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Maps
                  </Button>
                </div>
                <div className="mt-3">
                  <SpotMiniMap lat={spot.location.lat} lng={spot.location.lng} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {spot && (
                  <CheckInButton
                    spotId={spot.id}
                    spotName={spot.name}
                    userLocation={userLocation ?? undefined}
                    className="flex-1"
                  />
                )}

                <Button
                  variant="outline"
                  onClick={handleShare}
                  className="border-neutral-700 text-white hover:bg-neutral-800"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Meta info */}
              {spot.createdAt && (
                <div className="flex items-center gap-2 text-sm text-gray-500 pt-2 border-t border-neutral-800">
                  <Calendar className="w-4 h-4" />
                  Added {new Date(spot.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
