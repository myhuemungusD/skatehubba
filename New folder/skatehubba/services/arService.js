import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class ARService {
  constructor() {
    this.isARSupported = false;
    this.currentLocation = null;
    this.nearbySpots = [];
    this.droppedClips = [];
  }

  async initialize() {
    try {
      // Check AR support
      this.isARSupported = await this.checkARSupport();
      
      // Request permissions
      await this.requestPermissions();
      
      // Get current location
      this.currentLocation = await this.getCurrentLocation();
      
      analyticsService.logEvent('ar_initialized', {
        category: EventCategory.AR,
        supported: this.isARSupported,
      });

      return this.isARSupported;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ar_service',
        action: 'initialize',
      });
      return false;
    }
  }

  async checkARSupport() {
    try {
      // For now, we'll assume basic AR support based on camera availability
      // In a real implementation, you'd use ARCore/ARKit detection
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      return false;
    }
  }

  async requestPermissions() {
    const cameraPermission = await Camera.requestCameraPermissionsAsync();
    const locationPermission = await Location.requestForegroundPermissionsAsync();

    if (cameraPermission.status !== 'granted') {
      throw new Error('Camera permission required for AR features');
    }

    if (locationPermission.status !== 'granted') {
      throw new Error('Location permission required for AR features');
    }
  }

  async getCurrentLocation() {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude,
        heading: location.coords.heading,
      };
    } catch (error) {
      throw new Error('Failed to get current location');
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  async loadNearbySpots(radius = 1000) {
    try {
      if (!this.currentLocation) {
        await this.getCurrentLocation();
      }

      // In a real implementation, this would fetch from your backend
      // For now, we'll simulate some nearby spots
      this.nearbySpots = await this.fetchNearbySpots(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        radius
      );

      return this.nearbySpots;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ar_service',
        action: 'load_nearby_spots',
      });
      return [];
    }
  }

  async fetchNearbySpots(lat, lon, radius) {
    // Simulate API call - replace with actual backend call
    return [
      {
        id: '1',
        name: 'Downtown Skate Plaza',
        type: 'plaza',
        latitude: lat + 0.001,
        longitude: lon + 0.001,
        rating: 4.5,
        difficulty: 'intermediate',
        features: ['stairs', 'rails', 'ledges'],
        clips: 15,
        challenges: 3,
        description: 'Popular downtown spot with great lines and obstacles',
      },
      {
        id: '2',
        name: 'Hidden Ledge Spot',
        type: 'street',
        latitude: lat - 0.002,
        longitude: lon + 0.0015,
        rating: 4.0,
        difficulty: 'advanced',
        features: ['ledges', 'gaps'],
        clips: 8,
        challenges: 1,
        description: 'Secret spot with perfect ledges',
      },
      {
        id: '3',
        name: 'Bank to Bank',
        type: 'transition',
        latitude: lat + 0.0015,
        longitude: lon - 0.001,
        rating: 3.8,
        difficulty: 'beginner',
        features: ['banks', 'transitions'],
        clips: 12,
        challenges: 2,
        description: 'Great for practicing transitions',
      },
    ];
  }

  getAROverlayData(cameraHeading, cameraPitch = 0) {
    if (!this.currentLocation || !this.nearbySpots.length) {
      return [];
    }

    return this.nearbySpots.map(spot => {
      const distance = this.calculateDistance(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        spot.latitude,
        spot.longitude
      );

      const bearing = this.calculateBearing(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        spot.latitude,
        spot.longitude
      );

      // Calculate relative angle from camera heading
      let relativeAngle = bearing - cameraHeading;
      if (relativeAngle > 180) relativeAngle -= 360;
      if (relativeAngle < -180) relativeAngle += 360;

      // Only show spots within field of view (roughly 60 degrees)
      const inView = Math.abs(relativeAngle) < 30;

      return {
        ...spot,
        distance,
        bearing,
        relativeAngle,
        inView,
        screenPosition: this.calculateScreenPosition(relativeAngle, distance),
      };
    }).filter(spot => spot.inView && spot.distance < 1000); // Only show spots within 1km
  }

  calculateScreenPosition(relativeAngle, distance) {
    // Simple calculation - in a real AR app, this would use proper 3D projection
    const screenWidth = 375; // Assume iPhone width
    const screenHeight = 667;
    
    // Map angle to x position (-30 to 30 degrees -> 0 to screen width)
    const x = (relativeAngle + 30) / 60 * screenWidth;
    
    // Y position based on distance (closer = lower on screen)
    const y = screenHeight * 0.7 - (1000 - distance) / 1000 * screenHeight * 0.3;
    
    return { x, y };
  }

  async dropClip(clipData, location = null) {
    try {
      const dropLocation = location || this.currentLocation;
      
      if (!dropLocation) {
        throw new Error('Location required to drop clip');
      }

      const droppedClip = {
        id: Date.now().toString(),
        ...clipData,
        location: dropLocation,
        droppedAt: new Date().toISOString(),
        discoverable: true,
      };

      // In a real implementation, save to backend
      this.droppedClips.push(droppedClip);

      analyticsService.logEvent('ar_clip_dropped', {
        category: EventCategory.AR,
        clip_type: clipData.type,
        location: `${dropLocation.latitude},${dropLocation.longitude}`,
      });

      return droppedClip;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ar_service',
        action: 'drop_clip',
      });
      throw error;
    }
  }

  async discoverClips(radius = 100) {
    try {
      if (!this.currentLocation) {
        throw new Error('Location required to discover clips');
      }

      const nearbyClips = this.droppedClips.filter(clip => {
        const distance = this.calculateDistance(
          this.currentLocation.latitude,
          this.currentLocation.longitude,
          clip.location.latitude,
          clip.location.longitude
        );
        return distance <= radius;
      });

      analyticsService.logEvent('ar_clips_discovered', {
        category: EventCategory.AR,
        count: nearbyClips.length,
      });

      return nearbyClips;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ar_service',
        action: 'discover_clips',
      });
      return [];
    }
  }

  async rateSpot(spotId, rating, review = '') {
    try {
      // In a real implementation, save to backend
      analyticsService.logEvent('ar_spot_rated', {
        category: EventCategory.AR,
        spot_id: spotId,
        rating: rating,
      });

      return { success: true, rating };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'ar_service',
        action: 'rate_spot',
      });
      throw error;
    }
  }
}

export default new ARService();
