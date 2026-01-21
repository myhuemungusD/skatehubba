import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapPin, ArrowLeft, Loader2 } from "lucide-react";
import { type Spot } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGeolocation } from "@/hooks/useGeolocation";
import { CheckInButton } from "@/features/checkins/CheckInButton";

interface SpotDetailPageProps {
  params: {
    id?: string;
  };
}

export default function SpotDetailPage({ params }: SpotDetailPageProps) {
  const geolocation = useGeolocation(true);
  const spotId = Number(params.id);

  const {
    data: spots = [],
    isLoading,
    isError,
  } = useQuery<Spot[]>({
    queryKey: ["/api/spots"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/spots");
      return response.json();
    },
  });

  const spot = useMemo(() => spots.find((item) => item.id === spotId), [spots, spotId]);

  const userLocation = useMemo(() => {
    if (geolocation.latitude === null || geolocation.longitude === null) {
      return null;
    }
    return { lat: geolocation.latitude, lng: geolocation.longitude };
  }, [geolocation.latitude, geolocation.longitude]);

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

      <Card className="bg-neutral-900/70 border-neutral-800">
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
          <CheckInButton spotId={spot.id} spotName={spot.name} userLocation={userLocation} />
        </CardContent>
      </Card>
    </div>
  );
}
