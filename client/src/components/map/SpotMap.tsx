import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icon issue in bundled environments
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface SpotBase {
  id: number;
  name: string;
  lat: number;
  lng: number;
  spotType: string | null;
  tier: string | null;
}

interface Props<T extends SpotBase> {
  spots: T[];
  onSelect: (spot: T) => void;
}

export function SpotMap<T extends SpotBase>({ spots, onSelect }: Props<T>) {
  // Default center: Los Angeles
  const center: [number, number] = [34.05, -118.25];

  return (
    <MapContainer center={center} zoom={10} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          eventHandlers={{ click: () => onSelect(spot) }}
        >
          <Popup>
            <strong>{spot.name}</strong>
            <br />
            {spot.spotType} · {spot.tier}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
