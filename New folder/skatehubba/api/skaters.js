// Mock API for nearby skaters - replace with your Firestore/geohash implementation
export const getNearbySkaters = async () => {
  // Mock data for development
  return [
    {
      uid: '1',
      username: 'Mike V.',
      avatarUrl: 'https://via.placeholder.com/54',
      status: 'Skating',
      location: { lat: 34.0522, lng: -118.2437 },
      distance: 0.2
    },
    {
      uid: '2', 
      username: 'Lacey B.',
      avatarUrl: 'https://via.placeholder.com/54',
      status: 'Live Session',
      location: { lat: 34.0522, lng: -118.2437 },
      distance: 0.5
    },
    {
      uid: '3',
      username: 'Tommy',
      avatarUrl: 'https://via.placeholder.com/54', 
      status: 'Skating',
      location: { lat: 34.0522, lng: -118.2437 },
      distance: 1.2
    }
  ];
};

// Real implementation would use Firestore with geohash queries:
/*
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import * as Location from 'expo-location';

export const getNearbySkaters = async (radiusKm = 5) => {
  try {
    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    
    const { latitude, longitude } = location.coords;
    
    // Use geohash library to create bounding box
    const bounds = geohashBounds(latitude, longitude, radiusKm);
    
    // Query Firestore for users within geohash bounds
    const skatersRef = collection(db, 'users');
    const q = query(
      skatersRef,
      where('geohash', '>=', bounds.lower),
      where('geohash', '<=', bounds.upper),
      where('isOnline', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const skaters = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const distance = calculateDistance(
        latitude, longitude,
        data.location.lat, data.location.lng
      );
      
      if (distance <= radiusKm) {
        skaters.push({
          uid: doc.id,
          ...data,
          distance
        });
      }
    });
    
    return skaters.sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('Error fetching nearby skaters:', error);
    return [];
  }
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
*/
