import { useState, useEffect } from "react";
import { api } from "../lib/api/client";
import { SpotMap } from "../components/map/SpotMap";

interface Spot {
  id: number;
  name: string;
  description: string | null;
  spotType: string | null;
  tier: string | null;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
  rating: number;
  ratingCount: number;
  checkInCount: number;
}

export function MapPage() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Spot | null>(null);

  useEffect(() => {
    api
      .get<{ spots: Spot[] }>("/spots")
      .then((data) => setSpots(data.spots))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Spot Map</h1>

      {loading ? (
        <p className="text-gray-500">Loading spots...</p>
      ) : (
        <div className="rounded-xl overflow-hidden border border-gray-800" style={{ height: "60vh" }}>
          <SpotMap spots={spots} onSelect={setSelected} />
        </div>
      )}

      {/* Selected spot detail */}
      {selected && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <p className="text-sm text-gray-400">
                {[selected.spotType, selected.tier, selected.city, selected.state]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {selected.description && (
                <p className="text-sm text-gray-300 mt-2">{selected.description}</p>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-500 hover:text-white"
            >
              x
            </button>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500">
            <span>Rating: {selected.rating.toFixed(1)} ({selected.ratingCount})</span>
            <span>Check-ins: {selected.checkInCount}</span>
          </div>
        </div>
      )}

      {/* Coming soon */}
      <div className="mt-6 p-4 bg-gray-800/50 rounded-xl border border-dashed border-gray-700 text-center">
        <p className="text-gray-500 text-sm">Add Spot & Check-in — Coming Soon</p>
      </div>
    </div>
  );
}
