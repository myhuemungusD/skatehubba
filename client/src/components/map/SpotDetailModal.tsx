import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Star,
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Spot } from "@shared/schema";
import { CheckInButton } from "@/features/checkins/CheckInButton";

// Labels with emojis for display
const SPOT_TYPE_LABELS: Record<string, string> = {
  rail: "🛤️ Rail",
  ledge: "📐 Ledge",
  stairs: "🪜 Stairs",
  gap: "🌉 Gap",
  bank: "📐 Bank",
  "manual-pad": "⬜ Manual Pad",
  flat: "🛹 Flat Ground",
  bowl: "🥣 Bowl",
  "mini-ramp": "🛷 Mini Ramp",
  vert: "🎢 Vert",
  diy: "🔨 DIY",
  park: "🏟️ Skate Park",
  street: "🏙️ Street Spot",
  other: "❓ Other",
};

const TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  bronze: {
    label: "🥉 Bronze",
    color: "text-amber-600",
    bgColor: "bg-amber-900/30 border-amber-700",
  },
  silver: { label: "🥈 Silver", color: "text-gray-300", bgColor: "bg-gray-700/30 border-gray-500" },
  gold: {
    label: "🥇 Gold",
    color: "text-yellow-400",
    bgColor: "bg-yellow-900/30 border-yellow-600",
  },
  legendary: {
    label: "👑 Legendary",
    color: "text-purple-400",
    bgColor: "bg-purple-900/30 border-purple-600",
  },
};

interface SpotDetailModalProps {
  spotId: number | null;
  /** Pass spot data directly to avoid redundant API fetch */
  initialSpot?: Spot | null;
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
  const [userRating, setUserRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);

  // Only fetch if we don't have the spot data passed in
  // This eliminates the redundant round-trip when parent already has the data
  const {
    data: fetchedSpot,
    isLoading,
    error,
  } = useQuery<Spot>({
    queryKey: ["/api/spots", spotId],
    queryFn: async () => {
      if (!spotId) throw new Error("No spot ID");
      const response = await apiRequest("GET", `/api/spots/${spotId}`);
      return response.json();
    },
    enabled: isOpen && spotId !== null && !initialSpot,
    // Use initialSpot as initial data if available
    initialData: initialSpot ?? undefined,
  });

  // Use passed spot or fetched spot
  const spot = initialSpot ?? fetchedSpot;

  // Rating mutation
  const rateMutation = useMutation({
    mutationFn: async (rating: number) => {
      if (!spotId) throw new Error("No spot ID");
      const response = await apiRequest("POST", `/api/spots/${spotId}/rate`, { rating });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spots", spotId] });
      queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
      toast({
        title: "⭐ Rating submitted!",
        description: "Thanks for your feedback.",
      });
    },
    onError: (error) => {
      toast({
        title: "Rating failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Calculate distance if user location available
  const getDistance = () => {
    if (!userLocation || !spot) return null;

    const R = 6371; // Earth's radius in km
    const dLat = ((spot.lat - userLocation.lat) * Math.PI) / 180;
    const dLon = ((spot.lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((spot.lat * Math.PI) / 180) *
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
      // User cancelled or error
    }
  };

  const openInMaps = () => {
    if (!spot) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
    window.open(url, "_blank");
  };

  const tierConfig = spot?.tier ? TIER_CONFIG[spot.tier] : null;
  const distance = getDistance();

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
              {spot.photoUrl ? (
                <img src={spot.photoUrl} alt={spot.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-6xl">🛹</div>
              )}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 transition"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Tier Badge */}
              {tierConfig && (
                <div
                  className={`absolute top-3 left-3 px-3 py-1 rounded-full ${tierConfig.bgColor} border`}
                >
                  <span className={`text-sm font-medium ${tierConfig.color}`}>
                    {tierConfig.label}
                  </span>
                </div>
              )}
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

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Users className="w-4 h-4" />
                    Check-ins
                  </div>
                  <div className="text-2xl font-bold text-white">{spot.checkInCount || 0}</div>
                </div>

                <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Star className="w-4 h-4" />
                    Rating
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {spot.rating ? `${Number(spot.rating).toFixed(1)}` : "—"}
                    {spot.ratingCount ? (
                      <span className="text-sm font-normal text-gray-400 ml-1">
                        ({spot.ratingCount})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-[#ff6a00] mt-0.5" />
                  <div className="flex-1">
                    <div className="text-white">
                      {spot.city && spot.state
                        ? `${spot.city}, ${spot.state}`
                        : spot.address || "Location on map"}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {spot.lat.toFixed(6)}, {spot.lng.toFixed(6)}
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
              </div>

              {/* Rating Input */}
              <div className="space-y-3">
                <div className="text-sm text-gray-400">Rate this spot:</div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => {
                        setUserRating(star);
                        rateMutation.mutate(star);
                      }}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      disabled={rateMutation.isPending}
                      className="p-1 transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      <Star
                        className={`w-8 h-8 ${
                          star <= (hoverRating || userRating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-600"
                        }`}
                      />
                    </button>
                  ))}
                  {rateMutation.isPending && (
                    <Loader2 className="w-5 h-5 ml-2 animate-spin text-gray-400" />
                  )}
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
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/spots", spotId] });
                      queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
                    }}
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
