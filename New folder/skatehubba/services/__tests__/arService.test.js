import arService from '../arService';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';

// Mock dependencies
jest.mock('expo-location');
jest.mock('expo-camera');
jest.mock('../analytics');
jest.mock('../errorHandler');

describe('ARService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with permissions', async () => {
      Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 10,
          heading: 0,
        },
      });

      const result = await arService.initialize();

      expect(result).toBe(true);
      expect(Camera.requestCameraPermissionsAsync).toHaveBeenCalled();
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    });

    it('should fail initialization without camera permission', async () => {
      Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await arService.initialize();

      expect(result).toBe(false);
    });

    it('should fail initialization without location permission', async () => {
      Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await arService.initialize();

      expect(result).toBe(false);
    });
  });

  describe('distance calculation', () => {
    it('should calculate distance correctly', () => {
      const distance = arService.calculateDistance(37.7749, -122.4194, 37.7849, -122.4094);
      
      // Should be approximately 1.4km
      expect(distance).toBeGreaterThan(1000);
      expect(distance).toBeLessThan(2000);
    });

    it('should return 0 for same coordinates', () => {
      const distance = arService.calculateDistance(37.7749, -122.4194, 37.7749, -122.4194);
      expect(distance).toBe(0);
    });
  });

  describe('bearing calculation', () => {
    it('should calculate bearing correctly', () => {
      const bearing = arService.calculateBearing(37.7749, -122.4194, 37.7849, -122.4194);
      
      // Should be approximately north (0 degrees)
      expect(bearing).toBeCloseTo(0, 0);
    });
  });

  describe('AR overlay data', () => {
    beforeEach(async () => {
      Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 10,
          heading: 0,
        },
      });
      
      await arService.initialize();
      await arService.loadNearbySpots();
    });

    it('should filter spots by field of view', () => {
      const overlayData = arService.getAROverlayData(0); // Looking north
      
      // Should only include spots within 30 degrees of camera heading
      overlayData.forEach(spot => {
        expect(Math.abs(spot.relativeAngle)).toBeLessThanOrEqual(30);
      });
    });

    it('should calculate screen positions', () => {
      const overlayData = arService.getAROverlayData(0);
      
      overlayData.forEach(spot => {
        expect(spot.screenPosition).toHaveProperty('x');
        expect(spot.screenPosition).toHaveProperty('y');
        expect(spot.screenPosition.x).toBeGreaterThanOrEqual(0);
        expect(spot.screenPosition.y).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('clip dropping', () => {
    beforeEach(async () => {
      Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 10,
          heading: 0,
        },
      });
      
      await arService.initialize();
    });

    it('should drop a clip successfully', async () => {
      const clipData = {
        title: 'Test Clip',
        description: 'Test description',
        type: 'trick',
        difficulty: 'intermediate',
        videoUri: 'file://test.mp4',
      };

      const result = await arService.dropClip(clipData);

      expect(result).toHaveProperty('id');
      expect(result.title).toBe('Test Clip');
      expect(result.location).toHaveProperty('latitude');
      expect(result.location).toHaveProperty('longitude');
    });

    it('should fail to drop clip without location', async () => {
      arService.currentLocation = null;
      
      const clipData = {
        title: 'Test Clip',
        videoUri: 'file://test.mp4',
      };

      await expect(arService.dropClip(clipData)).rejects.toThrow('Location required to drop clip');
    });
  });

  describe('clip discovery', () => {
    beforeEach(async () => {
      Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Location.getCurrentPositionAsync.mockResolvedValue({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          altitude: 10,
          heading: 0,
        },
      });
      
      await arService.initialize();
    });

    it('should discover nearby clips', async () => {
      // Drop a clip first
      await arService.dropClip({
        title: 'Test Clip',
        videoUri: 'file://test.mp4',
      });

      const clips = await arService.discoverClips(200);

      expect(clips).toHaveLength(1);
      expect(clips[0].title).toBe('Test Clip');
    });

    it('should filter clips by radius', async () => {
      // Drop a clip at current location
      await arService.dropClip({
        title: 'Close Clip',
        videoUri: 'file://test.mp4',
      });

      // Manually add a far clip
      arService.droppedClips.push({
        id: 'far-clip',
        title: 'Far Clip',
        location: {
          latitude: 38.7749, // ~111km away
          longitude: -122.4194,
        },
      });

      const nearbyClips = await arService.discoverClips(100);

      expect(nearbyClips).toHaveLength(1);
      expect(nearbyClips[0].title).toBe('Close Clip');
    });
  });
});
