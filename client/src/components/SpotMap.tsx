import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error -- third-party typing mismatch (documented intentional override)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface Spot {
  id: number;
  name: string;
  lat: number;
  lng: number;
  proximity?: 'here' | 'nearby' | 'far' | null;
  distance?: number | null;
}

interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
}

interface SpotMapProps {
  spots: Spot[];
  userLocation: UserLocation | null;
  selectedSpotId: number | null;
  onSelectSpot: (spotId: number) => void;
  addSpotMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
}

export function SpotMap({ spots, userLocation, selectedSpotId, onSelectSpot, addSpotMode = false, onMapClick }: SpotMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const spotMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const hasCenteredRef = useRef(false); // Track if we've centered on user location
  const tempMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map ONCE on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    try {
      // Create map instance with default view
      const map = L.map(mapContainerRef.current, {
        center: userLocation ? [userLocation.lat, userLocation.lng] : [40.7589, -73.9851], // NYC default
        zoom: userLocation ? 15 : 12,
        scrollWheelZoom: true,
        zoomControl: true,
      });

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }

    // Cleanup only on unmount
    return () => {
      spotMarkersRef.current.forEach(marker => marker.remove());
      spotMarkersRef.current.clear();
      
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run once

  // Update spot markers when spots change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    
    // Remove markers that no longer exist
    const currentSpotIds = new Set(spots.map(s => s.id));
    spotMarkersRef.current.forEach((marker, id) => {
      if (!currentSpotIds.has(id)) {
        marker.remove();
        spotMarkersRef.current.delete(id);
      }
    });

    // Add or update spot markers
    spots.forEach(spot => {
      let marker = spotMarkersRef.current.get(spot.id);
      
      // Create custom icon based on proximity
      const icon = L.divIcon({
        html: `
          <div class="relative">
            <div class="w-8 h-8 rounded-full ${
              spot.proximity === 'here' 
                ? 'bg-success ring-4 ring-success/30' 
                : spot.proximity === 'nearby'
                ? 'bg-orange-500 ring-4 ring-orange-500/30'
                : 'bg-[#ff6a00] ring-4 ring-[#ff6a00]/30'
            } flex items-center justify-center shadow-lg">
              <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
        `,
        className: 'custom-spot-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      if (!marker) {
        // Create new marker
        marker = L.marker([spot.lat, spot.lng], { icon })
          .addTo(map)
          .on('click', () => onSelectSpot(spot.id));
        
        marker.bindPopup(`<div class="font-semibold">${spot.name}</div>`);
        spotMarkersRef.current.set(spot.id, marker);
      } else {
        // Update existing marker position AND icon (for proximity color changes)
        marker.setLatLng([spot.lat, spot.lng]);
        marker.setIcon(icon);
      }
    });
  }, [spots, onSelectSpot]);

  // Update user location marker
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    if (userLocation) {
      // Create or update user marker
      if (!userMarkerRef.current) {
        const userIcon = L.divIcon({
          html: `
            <div class="relative">
              <div class="w-10 h-10 rounded-full bg-blue-500 ring-4 ring-blue-500/30 flex items-center justify-center shadow-lg animate-pulse">
                <div class="w-3 h-3 rounded-full bg-white"></div>
              </div>
            </div>
          `,
          className: 'custom-user-marker',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
          .addTo(map)
          .bindPopup('<div class="font-semibold">You are here</div>');
      } else {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      }

      // Create or update accuracy circle (30m check-in radius)
      if (!accuracyCircleRef.current && userLocation.accuracy) {
        accuracyCircleRef.current = L.circle([userLocation.lat, userLocation.lng], {
          radius: Math.max(30, userLocation.accuracy),
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(map);
      } else if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([userLocation.lat, userLocation.lng]);
        if (userLocation.accuracy) {
          accuracyCircleRef.current.setRadius(Math.max(30, userLocation.accuracy));
        }
      }

      if (!hasCenteredRef.current) {
        map.setView([userLocation.lat, userLocation.lng], 15);
        hasCenteredRef.current = true;
      }
    } else {
      // Remove user marker if no location
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }
    }
  }, [userLocation]);

  // Highlight selected spot
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    spotMarkersRef.current.forEach((marker, id) => {
      if (id === selectedSpotId) {
        marker.openPopup();
        // Optionally pan to selected marker
        mapInstanceRef.current?.panTo(marker.getLatLng());
      }
    });
  }, [selectedSpotId]);

  // Handle add spot mode - allow clicking on map to place pin
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (addSpotMode && onMapClick) {
        // Remove previous temp marker
        if (tempMarkerRef.current) {
          tempMarkerRef.current.remove();
        }

        // Add temporary marker at clicked location
        const tempMarker = L.marker([e.latlng.lat, e.latlng.lng], {
          icon: L.divIcon({
            html: `
              <div class="relative">
                <div class="w-10 h-10 rounded-full bg-orange-500 border-4 border-white shadow-lg flex items-center justify-center animate-pulse">
                  <span class="text-white text-xl">📍</span>
                </div>
              </div>
            `,
            className: '',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          })
        }).addTo(map);

        tempMarkerRef.current = tempMarker;
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    };

    if (addSpotMode) {
      map.on('click', handleMapClick);
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.off('click', handleMapClick);
      map.getContainer().style.cursor = '';
      
      // Remove temp marker when exiting add mode
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }
    }

    return () => {
      map.off('click', handleMapClick);
    };
  }, [addSpotMode, onMapClick]);

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-full bg-gray-900"
      style={{ minHeight: '100%' }}
      data-testid="map-container"
    />
  );
}
