import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { updateChallengeStatus } from '../../api/challengeApi';

export function ChallengeActions({ challenge, onStatusUpdate }) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (status) => {
    setLoading(true);
    try {
      await updateChallengeStatus(challenge.id, status);
      onStatusUpdate?.(status);

      if (status === 'accepted') {
        // Navigate to submit move screen if accepted
        navigation.navigate('SubmitMove', { challengeId: challenge.id });
      }
    } catch (error) {
      console.error('Error updating challenge status:', error);
      Alert.alert(
        'Error',
        'Failed to update challenge status. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (challenge.status !== 'pending') {
    return null;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.acceptButton]}
        onPress={() => handleAction('accepted')}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.buttonText}>Accept Challenge</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.declineButton]}
        onPress={() => handleAction('declined')}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.buttonText}>Decline</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#FF5722',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
