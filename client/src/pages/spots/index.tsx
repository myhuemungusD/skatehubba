import { useMemo, useState } from "react";
import { Link } from "wouter";
import { MapPin, Search, Loader2, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SpotDifficultySchema, SpotTypeSchema } from "@shared/validation/spots";
import { useSpotDirectory, type SpotSort } from "@/features/spots/useSpotDirectory";
import { useGeolocation } from "@/hooks/useGeolocation";
import { calculateDistance } from "@/lib/distance";

const SPOT_TYPES = SpotTypeSchema.options;
const DIFFICULTIES = SpotDifficultySchema.options;

export default function SpotDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [sort, setSort] = useState<SpotSort>("closest");
  const [radiusMiles, setRadiusMiles] = useState<number>(10);
  const geolocation = useGeolocation(true);

  const { spots, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useSpotDirectory({
    sort,
  });

  const userLocation = useMemo(() => {
    if (geolocation.latitude === null || geolocation.longitude === null) return null;
    return { lat: geolocation.latitude, lng: geolocation.longitude };
  }, [geolocation.latitude, geolocation.longitude]);

  const filteredSpots = useMemo(() => {
    let result = spots;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((spot) => {
        const haystack = `${spot.name} ${spot.description ?? ""} ${spot.city ?? ""} ${
          spot.state ?? ""
        } ${spot.features.join(" ")}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    if (selectedType !== "all") {
      result = result.filter((spot) => spot.spotType === selectedType);
    }

    if (selectedDifficulty !== "all") {
      result = result.filter((spot) => spot.difficulty === selectedDifficulty);
    }

    if (userLocation) {
      result = result.filter((spot) => {
        const distanceMeters = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          spot.location.lat,
          spot.location.lng
        );
        const distanceMiles = distanceMeters / 1609.34;
        return distanceMiles <= radiusMiles;
      });
    }

    if (sort === "closest" && userLocation) {
      result = [...result].sort((a, b) => {
        const distanceA = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          a.location.lat,
          a.location.lng
        );
        const distanceB = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          b.location.lat,
          b.location.lng
        );
        return distanceA - distanceB;
      });
    }

    if (sort === "trending") {
      result = [...result].sort((a, b) => b.stats.checkins30d - a.stats.checkins30d);
    }

    if (sort === "newest") {
      result = [...result].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    return result;
  }, [
    spots,
    searchQuery,
    selectedType,
    selectedDifficulty,
    userLocation,
    radiusMiles,
    sort,
  ]);

  return (
    <div className="space-y-6">
      <Card className="bg-neutral-950/70 border-neutral-800">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white flex items-center gap-2">
            <MapPin className="h-5 w-5 text-yellow-400" />
            Spot Directory
          </CardTitle>
          <p className="text-sm text-neutral-400">
            Search, filter, and discover skate spots around you.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, city, or feature..."
              className="pl-9 bg-neutral-900 border-neutral-700 text-white"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                <SelectValue placeholder="Spot type" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-700 text-white">
                <SelectItem value="all">All types</SelectItem>
                {SPOT_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type.replace("-", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-700 text-white">
                <SelectItem value="all">All difficulties</SelectItem>
                {DIFFICULTIES.map((difficulty) => (
                  <SelectItem key={difficulty} value={difficulty} className="capitalize">
                    {difficulty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Select value={String(radiusMiles)} onValueChange={(value) => setRadiusMiles(Number(value))}>
              <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                <SelectValue placeholder="Radius" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-700 text-white">
                <SelectItem value="5">5 miles</SelectItem>
                <SelectItem value="10">10 miles</SelectItem>
                <SelectItem value="25">25 miles</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(value) => setSort(value as SpotSort)}>
              <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-700 text-white">
                <SelectItem value="closest">Closest</SelectItem>
                <SelectItem value="trending">Trending</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Filter className="h-4 w-4" />
            {filteredSpots.length} spots found
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading spots...
        </div>
      ) : filteredSpots.length === 0 ? (
        <div className="text-center text-sm text-neutral-400">
          No spots match your filters yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSpots.map((spot) => (
            <Card key={spot.id} className="bg-neutral-950/70 border-neutral-800">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg text-white font-semibold">{spot.name}</h3>
                  <Badge className="bg-yellow-500/20 text-yellow-300 capitalize">
                    {spot.spotType}
                  </Badge>
                </div>
                <p className="text-sm text-neutral-400">
                  {spot.city || "Unknown city"}
                  {spot.state ? `, ${spot.state}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {spot.features.slice(0, 4).map((feature) => (
                    <Badge
                      key={feature}
                      variant="outline"
                      className="border-neutral-700 text-neutral-300"
                    >
                      {feature}
                    </Badge>
                  ))}
                  {spot.features.length > 4 && (
                    <Badge variant="outline" className="border-neutral-700 text-neutral-300">
                      +{spot.features.length - 4} more
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-neutral-500">
                    {spot.stats.checkins30d} check-ins (30d)
                  </div>
                  <Link href={`/spots/${spot.id}`} className="text-yellow-300 text-sm">
                    View details
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="bg-yellow-500 text-black hover:bg-yellow-400"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
