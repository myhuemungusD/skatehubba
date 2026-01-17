import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Flame, Star, Users } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'park' | 'street' | 'plaza' | 'legendary';
  difficulty: 1 | 2 | 3 | 4 | 5;
  checkIns: number;
  topTrick?: string;
  distance?: number;
  isUnlocked?: boolean;
}

interface SpotDiscoveryMapProps {
  userLat?: number;
  userLng?: number;
  onSpotSelect?: (spot: Spot) => void;
}

// Sample spots (replace with real data)
const DEMO_SPOTS: Spot[] = [
  { 
    id: '1', 
    name: 'Venice Skatepark', 
    lat: 33.9850, 
    lng: -118.4695, 
    type: 'legendary',
    difficulty: 5,
    checkIns: 1247,
    topTrick: '360 Flip',
    isUnlocked: true
  },
  { 
    id: '2', 
    name: 'Courthouse Plaza', 
    lat: 33.9880, 
    lng: -118.4720, 
    type: 'plaza',
    difficulty: 3,
    checkIns: 823,
    topTrick: 'Boardslide'
  },
  { 
    id: '3', 
    name: 'Downtown 9 Stair', 
    lat: 33.9900, 
    lng: -118.4650, 
    type: 'street',
    difficulty: 4,
    checkIns: 456,
    topTrick: 'Kickflip'
  },
  { 
    id: '4', 
    name: 'Local Skatepark', 
    lat: 33.9870, 
    lng: -118.4680, 
    type: 'park',
    difficulty: 2,
    checkIns: 2103,
    topTrick: 'Heelflip',
    isUnlocked: true
  },
];

export default function SpotDiscoveryMap({ userLat, userLng, onSpotSelect }: SpotDiscoveryMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [spots] = useState<Spot[]>(DEMO_SPOTS);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'nearby'>('all');
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map
    const centerLat = userLat || 33.9870;
    const centerLng = userLng || -118.4680;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView([centerLat, centerLng], 14);

    // Add custom dark theme tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;

    // Add user location marker
    if (userLat && userLng) {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: `<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>`,
        iconSize: [24, 24],
      });

      L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [userLat, userLng]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Filter spots based on selected filter
    const filteredSpots = spots.filter(spot => {
      if (filter === 'unlocked') return spot.isUnlocked;
      if (filter === 'nearby' && userLat && userLng) {
        const distance = calculateDistance(userLat, userLng, spot.lat, spot.lng);
        return distance < 5; // Within 5km
      }
      return true;
    });

    // Add spot markers
    filteredSpots.forEach(spot => {
      const spotIcon = createSpotIcon(spot);
      
      const marker = L.marker([spot.lat, spot.lng], { 
        icon: spotIcon,
      }).addTo(mapRef.current!);

      marker.on('click', () => {
        setSelectedSpot(spot);
        onSpotSelect?.(spot);
        mapRef.current?.setView([spot.lat, spot.lng], 16, { animate: true });
      });

      markersRef.current.push(marker);
    });
  }, [spots, filter, userLat, userLng, onSpotSelect]);

  const createSpotIcon = (spot: Spot) => {
    const typeColors = {
      legendary: 'bg-gradient-to-br from-yellow-400 to-orange-500',
      plaza: 'bg-gradient-to-br from-purple-500 to-pink-500',
      street: 'bg-gradient-to-br from-blue-500 to-cyan-500',
      park: 'bg-gradient-to-br from-green-500 to-emerald-500',
    };

    const color = typeColors[spot.type];
    const locked = !spot.isUnlocked;

    return L.divIcon({
      className: 'custom-spot-marker',
      html: `
        <div class="relative group cursor-pointer">
          <div class="${color} w-12 h-12 rounded-full border-3 border-white shadow-xl flex items-center justify-center transform transition-all hover:scale-110 ${locked ? 'opacity-50 grayscale' : 'animate-bounce'}">
            <span class="text-white text-xl">${locked ? '🔒' : '📍'}</span>
          </div>
          ${spot.type === 'legendary' ? '<div class="absolute -top-2 -right-2"><span class="text-2xl">⭐</span></div>' : ''}
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 48],
    });
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  return (
    <div className="relative h-full">
      {/* Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0 rounded-2xl overflow-hidden" />

      {/* Filter Controls */}
      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        {['all', 'unlocked', 'nearby'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as typeof filter)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              filter === f
                ? 'bg-orange-500 text-white shadow-lg'
                : 'bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Spot Stats */}
      <div className="absolute top-4 right-4 z-[1000] bg-black/80 backdrop-blur-sm rounded-lg p-4 text-white">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-orange-500" />
          <div>
            <p className="text-2xl font-bold">{spots.length}</p>
            <p className="text-xs text-gray-400">Spots Nearby</p>
          </div>
        </div>
      </div>

      {/* Selected Spot Card */}
      <AnimatePresence>
        {selectedSpot && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-4 left-4 right-4 z-[1000]"
          >
            <div className="bg-gradient-to-br from-zinc-900 to-black rounded-2xl p-6 border border-orange-500/30 shadow-2xl">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl font-bold text-white">{selectedSpot.name}</h3>
                    {selectedSpot.type === 'legendary' && (
                      <span className="text-yellow-400">⭐</span>
                    )}
                  </div>
                  <p className="text-orange-500 text-sm font-semibold capitalize">
                    {selectedSpot.type} Spot
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSpot(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Check-ins</p>
                  <p className="text-lg font-bold text-white">{selectedSpot.checkIns}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Difficulty</p>
                  <p className="text-lg font-bold text-white">
                    {'⭐'.repeat(selectedSpot.difficulty)}
                  </p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                  <Star className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Top Trick</p>
                  <p className="text-xs font-bold text-white">{selectedSpot.topTrick}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => onSpotSelect?.(selectedSpot)}
                  disabled={!selectedSpot.isUnlocked}
                  className={`flex-1 font-bold py-3 rounded-xl transition-all ${
                    selectedSpot.isUnlocked
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white'
                      : 'bg-zinc-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {selectedSpot.isUnlocked ? 'Check In' : '🔒 Locked'}
                </button>
                <button className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-3 rounded-xl transition-all">
                  <Navigation className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
