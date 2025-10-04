import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../services/localization';

const SpotMarker = ({ spot, onPress }) => {
  const { t } = useTranslation();
  
  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'beginner': return '#4CAF50';
      case 'intermediate': return '#FF9800';
      case 'advanced': return '#F44336';
      default: return '#2196F3';
    }
  };

  const getSpotIcon = (type) => {
    switch (type) {
      case 'plaza': return 'business';
      case 'street': return 'road';
      case 'transition': return 'trending-up';
      case 'park': return 'leaf';
      default: return 'location';
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.spotMarker,
        {
          left: spot.screenPosition.x - 30,
          top: spot.screenPosition.y - 60,
        }
      ]}
      onPress={() => onPress(spot)}
      accessible={true}
      accessibilityLabel={t('ar.spot.accessibility', { 
        name: spot.name, 
        distance: Math.round(spot.distance),
        rating: spot.rating 
      })}
      accessibilityRole="button"
    >
      {/* Main marker */}
      <View style={[styles.markerIcon, { backgroundColor: getDifficultyColor(spot.difficulty) }]}>
        <Ionicons name={getSpotIcon(spot.type)} size={20} color="#FFFFFF" />
      </View>
      
      {/* Info popup */}
      <View style={styles.markerInfo}>
        <Text style={styles.spotName} numberOfLines={1}>
          {spot.name}
        </Text>
        <View style={styles.spotDetails}>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.ratingText}>{spot.rating}</Text>
          </View>
          <Text style={styles.distanceText}>
            {spot.distance < 1000 
              ? `${Math.round(spot.distance)}m`
              : `${(spot.distance / 1000).toFixed(1)}km`
            }
          </Text>
        </View>
        
        {/* Features indicators */}
        <View style={styles.featuresContainer}>
          {spot.features.slice(0, 3).map((feature, index) => (
            <View key={index} style={styles.featureTag}>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
        
        {/* Clips and challenges count */}
        <View style={styles.countsContainer}>
          {spot.clips > 0 && (
            <View style={styles.countItem}>
              <Ionicons name="videocam" size={10} color="#FFFFFF" />
              <Text style={styles.countText}>{spot.clips}</Text>
            </View>
          )}
          {spot.challenges > 0 && (
            <View style={styles.countItem}>
              <Ionicons name="trophy" size={10} color="#FFFFFF" />
              <Text style={styles.countText}>{spot.challenges}</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* Direction arrow */}
      <View style={styles.directionArrow}>
        <Ionicons 
          name="chevron-down" 
          size={16} 
          color={getDifficultyColor(spot.difficulty)} 
        />
      </View>
    </TouchableOpacity>
  );
};

const ClipMarker = ({ clip, onPress }) => {
  return (
    <TouchableOpacity
      style={[
        styles.clipMarker,
        {
          left: clip.screenPosition.x - 15,
          top: clip.screenPosition.y - 30,
        }
      ]}
      onPress={() => onPress(clip)}
      accessible={true}
      accessibilityLabel={`Dropped clip: ${clip.title || 'Video clip'}`}
      accessibilityRole="button"
    >
      <View style={styles.clipIcon}>
        <Ionicons name="play" size={16} color="#FFFFFF" />
      </View>
      <View style={styles.clipPulse} />
    </TouchableOpacity>
  );
};

export default function AROverlay({ spots, clips = [], onSpotSelect, onClipSelect, screenWidth, screenHeight }) {
  const { t } = useTranslation();

  return (
    <View style={[styles.overlay, { width: screenWidth, height: screenHeight }]}>
      {/* Crosshair in center */}
      <View style={styles.crosshair}>
        <View style={styles.crosshairHorizontal} />
        <View style={styles.crosshairVertical} />
      </View>
      
      {/* Spot markers */}
      {spots.map((spot, index) => (
        <SpotMarker
          key={`spot-${spot.id}-${index}`}
          spot={spot}
          onPress={onSpotSelect}
        />
      ))}
      
      {/* Clip markers */}
      {clips.map((clip, index) => (
        <ClipMarker
          key={`clip-${clip.id}-${index}`}
          clip={clip}
          onPress={onClipSelect}
        />
      ))}
      
      {/* Distance indicator */}
      <View style={styles.distanceIndicator}>
        <Text style={styles.distanceText}>
          {t('ar.scanningRange', { range: '1km' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1000,
  },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -10 }, { translateY: -10 }],
    width: 20,
    height: 20,
  },
  crosshairHorizontal: {
    position: 'absolute',
    top: 9,
    left: 0,
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  crosshairVertical: {
    position: 'absolute',
    top: 0,
    left: 9,
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  spotMarker: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 1001,
  },
  markerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  markerInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
    minWidth: 120,
    maxWidth: 160,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  spotName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  spotDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 10,
    marginLeft: 2,
  },
  distanceText: {
    color: '#CCCCCC',
    fontSize: 10,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  featureTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginRight: 2,
    marginBottom: 2,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 8,
  },
  countsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 9,
    marginLeft: 2,
  },
  directionArrow: {
    marginTop: 2,
  },
  clipMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
  },
  clipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF4081',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  clipPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 64, 129, 0.3)',
    zIndex: -1,
  },
  distanceIndicator: {
    position: 'absolute',
    top: 120,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  distanceText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
});
