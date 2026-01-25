import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapPin, ArrowLeft, Loader2 } from "lucide-react";
import { fetchSpotById } from "@/features/spots/spotService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGeolocation } from "@/hooks/useGeolocation";
import { CheckInButton } from "@/features/checkins/CheckInButton";
import { usePresenceForSpot } from "@/features/presence/usePresenceForSpot";
import { SpotMiniMap } from "@/components/map/SpotMiniMap";

interface SpotDetailPageProps {
  params: {
    id?: string;
  };
}

export default function SpotDetailPage({ params }: SpotDetailPageProps) {
  const geolocation = useGeolocation(true);
  const spotId = params.id ?? "";

  const {
    data: spot,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["spots", "detail", spotId],
    queryFn: () => fetchSpotById(spotId),
    enabled: Boolean(spotId),
  });

  const userLocation = useMemo(() => {
    if (geolocation.latitude === null || geolocation.longitude === null) {
      return null;
    }
    return { lat: geolocation.latitude, lng: geolocation.longitude };
  }, [geolocation.latitude, geolocation.longitude]);
  const { users: presenceUsers } = usePresenceForSpot(spot?.id);

  if (isLoading) {
    return (
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading spot details...
        </CardContent>
      </Card>
    );
  }

  if (isError || !spot) {
    return (
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardContent className="py-12 text-center text-neutral-400">
          Spot not found. Head back to the map to explore nearby spots.
          <div className="mt-4">
            <Link href="/map" className="text-yellow-300 hover:text-yellow-200">
              <ArrowLeft className="inline-block h-4 w-4 mr-1" />
              Back to map
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/map" className="text-sm text-neutral-400 hover:text-neutral-200">
        <ArrowLeft className="inline-block h-4 w-4 mr-1" />
        Back to map
      </Link>

      <Card className="bg-neutral-900/70 border-neutral-800 overflow-hidden">
        {spot.photos?.[0]?.url ? (
          <img
            src={spot.photos[0].url}
            alt={spot.name}
            className="h-48 w-full object-cover"
          />
        ) : null}
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl text-white">{spot.name}</CardTitle>
            <Badge className="bg-yellow-500/20 text-yellow-300">{spot.spotType}</Badge>
          </div>
          <p className="text-sm text-neutral-400">{spot.description || "No description yet."}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <MapPin className="h-4 w-4 text-yellow-400" />
            {spot.city || "Unknown city"}, {spot.state || ""}
          </div>
          <SpotMiniMap lat={spot.location.lat} lng={spot.location.lng} />
          {spot.features.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {spot.features.map((feature) => (
                <Badge key={feature} variant="outline" className="border-neutral-700 text-neutral-300">
                  {feature}
                </Badge>
              ))}
            </div>
          )}
          <div className="text-sm text-neutral-400">
            Skating here now: {presenceUsers.length}
          </div>
          <CheckInButton spotId={spot.id} spotName={spot.name} userLocation={userLocation} />
        </CardContent>
      </Card>
    </div>
  );
}
