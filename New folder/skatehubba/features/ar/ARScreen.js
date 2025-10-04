import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTranslation } from '../../services/localization';
import arService from '../../services/arService';
import AROverlay from '../../components/ar/AROverlay';
import SpotInfoPanel from '../../components/ar/SpotInfoPanel';
import ClipDropModal from '../../components/ar/ClipDropModal';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ARScreen({ navigation }) {
  const { t } = useTranslation();
  const cameraRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [arSupported, setArSupported] = useState(false);
  const [nearbySpots, setNearbySpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [showDropModal, setShowDropModal] = useState(false);
  const [cameraHeading, setCameraHeading] = useState(0);
  const [arOverlayData, setArOverlayData] = useState([]);

  useEffect(() => {
    initializeAR();
    return () => {
      // Clean up - reset screen orientation
      ScreenOrientation.unlockAsync();
    };
  }, []);

  useEffect(() => {
    if (cameraReady && nearbySpots.length > 0) {
      updateAROverlay();
    }
  }, [cameraHeading, nearbySpots, cameraReady]);

  const initializeAR = async () => {
    try {
      setIsLoading(true);
      
      // Lock to portrait orientation
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      
      // Initialize AR service
      const supported = await arService.initialize();
      setArSupported(supported);
      
      if (supported) {
        const spots = await arService.loadNearbySpots();
        setNearbySpots(spots);
      }
      
      setHasPermission(supported);
    } catch (error) {
      Alert.alert(
        t('ar.error.title'),
        t('ar.error.initialization')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const updateAROverlay = () => {
    const overlayData = arService.getAROverlayData(cameraHeading);
    setArOverlayData(overlayData);
  };

  const handleCameraReady = () => {
    setCameraReady(true);
  };

  const handleSpotSelect = (spot) => {
    setSelectedSpot(spot);
  };

  const handleDropClip = async (clipData) => {
    try {
      await arService.dropClip(clipData);
      setShowDropModal(false);
      Alert.alert(
        t('ar.clip.dropped.title'),
        t('ar.clip.dropped.message')
      );
    } catch (error) {
      Alert.alert(
        t('ar.error.title'),
        t('ar.error.dropClip')
      );
    }
  };

  const handleRateSpot = async (spotId, rating) => {
    try {
      await arService.rateSpot(spotId, rating);
      Alert.alert(
        t('ar.rating.success.title'),
        t('ar.rating.success.message')
      );
    } catch (error) {
      Alert.alert(
        t('ar.error.title'),
        t('ar.error.rating')
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>{t('ar.loading')}</Text>
      </View>
    );
  }

  if (hasPermission === false || !arSupported) {
    return (
      <View style={styles.noPermissionContainer}>
        <Ionicons name="camera-off" size={64} color="#666666" />
        <Text style={styles.noPermissionText}>
          {t('ar.noPermission')}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={initializeAR}
        >
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        type={Camera.Constants.Type.back}
        onCameraReady={handleCameraReady}
        ratio="16:9"
      >
        {/* AR Overlay */}
        {cameraReady && (
          <AROverlay
            spots={arOverlayData}
            onSpotSelect={handleSpotSelect}
            screenWidth={screenWidth}
            screenHeight={screenHeight}
          />
        )}

        {/* Top Controls */}
        <View style={styles.topControls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => navigation.goBack()}
            accessible={true}
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{t('ar.title')}</Text>
            <Text style={styles.subtitle}>
              {t('ar.spotsFound', { count: nearbySpots.length })}
            </Text>
          </View>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowDropModal(true)}
            accessible={true}
            accessibilityLabel={t('ar.dropClip')}
            accessibilityRole="button"
          >
            <Ionicons name="videocam" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>{t('ar.dropClip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={initializeAR}
            accessible={true}
            accessibilityLabel={t('ar.refresh')}
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>{t('ar.refresh')}</Text>
          </TouchableOpacity>
        </View>

        {/* Spot Info Panel */}
        {selectedSpot && (
          <SpotInfoPanel
            spot={selectedSpot}
            onClose={() => setSelectedSpot(null)}
            onRate={handleRateSpot}
          />
        )}

        {/* Drop Clip Modal */}
        <ClipDropModal
          visible={showDropModal}
          onClose={() => setShowDropModal(false)}
          onDrop={handleDropClip}
        />
      </Camera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
  },
  noPermissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 32,
  },
  noPermissionText: {
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
    marginVertical: 24,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  topControls: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  actionButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    minWidth: 80,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});
