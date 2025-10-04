import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../services/localization';

const { width: screenWidth } = Dimensions.get('window');

const RatingStars = ({ rating, onRatingChange, editable = false }) => {
  const [tempRating, setTempRating] = useState(rating);

  const handleStarPress = (value) => {
    if (editable) {
      setTempRating(value);
      onRatingChange?.(value);
    }
  };

  return (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => handleStarPress(star)}
          disabled={!editable}
          accessible={true}
          accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
          accessibilityRole="button"
        >
          <Ionicons
            name={star <= (editable ? tempRating : rating) ? 'star' : 'star-outline'}
            size={20}
            color="#FFD700"
            style={styles.star}
          />
        </TouchableOpacity>
      ))}
      <Text style={styles.ratingText}>
        {editable ? tempRating.toFixed(1) : rating.toFixed(1)}
      </Text>
    </View>
  );
};

const FeatureChip = ({ feature }) => (
  <View style={styles.featureChip}>
    <Text style={styles.featureChipText}>{feature}</Text>
  </View>
);

const DifficultyBadge = ({ difficulty }) => {
  const getDifficultyColor = () => {
    switch (difficulty) {
      case 'beginner': return '#4CAF50';
      case 'intermediate': return '#FF9800';
      case 'advanced': return '#F44336';
      default: return '#2196F3';
    }
  };

  return (
    <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor() }]}>
      <Text style={styles.difficultyText}>{difficulty.toUpperCase()}</Text>
    </View>
  );
};

export default function SpotInfoPanel({ spot, onClose, onRate }) {
  const { t } = useTranslation();
  const [showRating, setShowRating] = useState(false);
  const [userRating, setUserRating] = useState(0);

  const handleRateSpot = () => {
    if (userRating === 0) {
      Alert.alert(
        t('ar.rating.error.title'),
        t('ar.rating.error.noRating')
      );
      return;
    }

    Alert.alert(
      t('ar.rating.confirm.title'),
      t('ar.rating.confirm.message', { rating: userRating, spot: spot.name }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.confirm'),
          onPress: () => {
            onRate(spot.id, userRating);
            setShowRating(false);
            setUserRating(0);
          },
        },
      ]
    );
  };

  const getDirectionsText = () => {
    if (spot.distance < 50) {
      return t('ar.directions.veryClose');
    } else if (spot.distance < 200) {
      return t('ar.directions.close');
    } else if (spot.distance < 500) {
      return t('ar.directions.nearby');
    } else {
      return t('ar.directions.far');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.spotName}>{spot.name}</Text>
            <DifficultyBadge difficulty={spot.difficulty} />
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessible={true}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Rating and Distance */}
          <View style={styles.infoRow}>
            <RatingStars rating={spot.rating} />
            <Text style={styles.distanceInfo}>
              {spot.distance < 1000 
                ? `${Math.round(spot.distance)}m ${getDirectionsText()}`
                : `${(spot.distance / 1000).toFixed(1)}km ${getDirectionsText()}`
              }
            </Text>
          </View>

          {/* Description */}
          <Text style={styles.description}>{spot.description}</Text>

          {/* Features */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ar.spot.features')}</Text>
            <View style={styles.featuresContainer}>
              {spot.features.map((feature, index) => (
                <FeatureChip key={index} feature={feature} />
              ))}
            </View>
          </View>

          {/* Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ar.spot.activity')}</Text>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Ionicons name="videocam" size={20} color="#FFFFFF" />
                <Text style={styles.statText}>
                  {t('ar.spot.clips', { count: spot.clips })}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="trophy" size={20} color="#FFFFFF" />
                <Text style={styles.statText}>
                  {t('ar.spot.challenges', { count: spot.challenges })}
                </Text>
              </View>
            </View>
          </View>

          {/* User Rating Section */}
          {showRating && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('ar.rating.your')}</Text>
              <RatingStars
                rating={userRating}
                onRatingChange={setUserRating}
                editable={true}
              />
              <View style={styles.ratingActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowRating(false);
                    setUserRating(0);
                  }}
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleRateSpot}
                >
                  <Text style={styles.submitButtonText}>{t('ar.rating.submit')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {!showRating && (
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => setShowRating(true)}
              accessible={true}
              accessibilityLabel={t('ar.rating.rate')}
              accessibilityRole="button"
            >
              <Ionicons name="star-outline" size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>{t('ar.rating.rate')}</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.directionsButton}
            onPress={() => {
              // TODO: Open directions in maps app
              Alert.alert(t('ar.directions.title'), t('ar.directions.message'));
            }}
            accessible={true}
            accessibilityLabel={t('ar.directions.get')}
            accessibilityRole="button"
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>{t('ar.directions.get')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 2000,
  },
  panel: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  spotName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 2,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 8,
  },
  distanceInfo: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  description: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureChip: {
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  featureChipText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 8,
  },
  difficultyBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  difficultyText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  ratingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  cancelButton: {
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flex: 1,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flex: 1,
    marginLeft: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  rateButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    flex: 1,
    justifyContent: 'center',
  },
  directionsButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flex: 1,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
