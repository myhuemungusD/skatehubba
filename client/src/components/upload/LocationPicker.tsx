import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useToast } from "../../hooks/use-toast";
import { logger } from "../../lib/logger";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
  });
}

// Define location type
export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

interface LocationPickerProps {
  onLocationSelect: (location: Location) => void;
  initialLocation?: Location;
}

// Los Angeles default location
const DEFAULT_CENTER: Location = { lat: 34.0522, lng: -118.2437, address: "Los Angeles, CA" };

export default function LocationPicker({ onLocationSelect, initialLocation }: LocationPickerProps) {
  const { toast } = useToast();
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapInitKey, setMapInitKey] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<Location>(
    initialLocation || DEFAULT_CENTER
  );
  const [manualLat, setManualLat] = useState(initialLocation?.lat.toString() || "");
  const [manualLng, setManualLng] = useState(initialLocation?.lng.toString() || "");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const handleLocationClick = useCallback(
    (lat: number, lng: number) => {
      const newLocation: Location = {
        lat,
        lng,
        address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      };
      setSelectedLocation(newLocation);
      setManualLat(lat.toFixed(6));
      setManualLng(lng.toFixed(6));
      onLocationSelect(newLocation);
    },
    [onLocationSelect]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mapContainerRef.current || mapRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      try {
        await import("leaflet/dist/leaflet.css");

        if (!isMounted || !mapContainerRef.current || mapRef.current) return;

        const map = L.map(mapContainerRef.current, {
          center: [selectedLocation.lat, selectedLocation.lng],
          zoom: 13,
          scrollWheelZoom: true,
          zoomControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        markerRef.current = L.marker([selectedLocation.lat, selectedLocation.lng]).addTo(map);

        map.on("click", (e: L.LeafletMouseEvent) => {
          handleLocationClick(e.latlng.lat, e.latlng.lng);
        });

        mapRef.current = map;
        setLeafletLoaded(true);
      } catch (error) {
        logger.error("Failed to initialize Leaflet map", error);
        if (isMounted) setMapError(true);
      }
    };

    void initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, [handleLocationClick, selectedLocation.lat, selectedLocation.lng, mapInitKey]);

  const getCurrentLocation = () => {
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support geolocation.",
        variant: "destructive",
      });
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        handleLocationClick(latitude, longitude);
        toast({
          title: "Location found! ",
          description: "Your current location has been set.",
        });
        setIsGettingLocation(false);
      },
      (error) => {
        logger.error("Geolocation error:", error);
        const isDenied = error.code === error.PERMISSION_DENIED;
        const isTimeout = error.code === error.TIMEOUT;
        toast({
          title: isDenied
            ? "Location access denied"
            : isTimeout
              ? "Location request timed out"
              : "Location unavailable",
          description: isDenied
            ? "Enable location in your browser settings, then try again."
            : isTimeout
              ? "Location took too long to resolve. Move to an open area and retry."
              : "Could not determine your location. Enter coordinates manually.",
          variant: "destructive",
        });
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 30_000,
        maximumAge: 0,
      }
    );
  };

  const handleManualUpdate = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || isNaN(lng)) {
      toast({
        title: "Invalid coordinates",
        description: "Please enter valid latitude and longitude values.",
        variant: "destructive",
      });
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({
        title: "Invalid coordinates",
        description: "Latitude must be between -90 and 90, longitude between -180 and 180.",
        variant: "destructive",
      });
      return;
    }

    handleLocationClick(lat, lng);
    toast({
      title: "Location updated! ",
      description: "Coordinates have been set manually.",
    });
  };

  const markerPosition = useMemo(
    () => [selectedLocation.lat, selectedLocation.lng] as [number, number],
    [selectedLocation]
  );

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng(markerPosition);
    mapRef.current.setView(markerPosition, mapRef.current.getZoom(), { animate: true });
  }, [markerPosition]);

  if (mapError) {
    return (
      <div className="w-full h-[400px] bg-[#232323] rounded-lg flex items-center justify-center border border-red-700">
        <div className="text-center space-y-3 px-4">
          <p className="text-red-400 text-sm font-medium">Failed to load map</p>
          <p className="text-gray-400 text-xs">Check your connection and try again.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-gray-600 text-white hover:bg-gray-700"
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
              }
              markerRef.current = null;
              setMapError(false);
              setLeafletLoaded(false);
              setMapInitKey((k) => k + 1);
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!leafletLoaded) {
    return (
      <div className="w-full h-[400px] bg-[#232323] rounded-lg flex items-center justify-center border border-gray-700">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
          <p className="text-gray-400 text-sm">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-white flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Location
        </Label>
        <Button
          type="button"
          onClick={getCurrentLocation}
          disabled={isGettingLocation}
          className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
          size="sm"
        >
          <Navigation className="w-4 h-4" />
          {isGettingLocation ? "Getting location..." : "Use Current Location"}
        </Button>
      </div>

      {/* Leaflet Map */}
      <div
        ref={mapContainerRef}
        className="w-full h-[400px] rounded-lg overflow-hidden border-2 border-gray-700"
      />

      {/* Manual Coordinate Entry */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="lat" className="text-white">
            Latitude
          </Label>
          <Input
            id="lat"
            type="number"
            step="any"
            placeholder="34.0522"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            className="bg-[#181818] border-gray-600 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lng" className="text-white">
            Longitude
          </Label>
          <Input
            id="lng"
            type="number"
            step="any"
            placeholder="-118.2437"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            className="bg-[#181818] border-gray-600 text-white"
          />
        </div>
      </div>

      <Button
        type="button"
        onClick={handleManualUpdate}
        variant="outline"
        className="w-full border-gray-600 text-white hover:bg-gray-700"
      >
        Update Location from Coordinates
      </Button>

      {selectedLocation && (
        <div className="text-sm text-gray-400 text-center p-2 bg-[#232323] rounded border border-gray-700">
          Selected:{" "}
          {selectedLocation.address ||
            `${selectedLocation.lat.toFixed(6)}, ${selectedLocation.lng.toFixed(6)}`}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        Click on the map to drop a pin, or enter coordinates manually
      </p>
    </div>
  );
}
