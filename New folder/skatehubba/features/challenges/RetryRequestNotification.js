import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { respondToRetryRequest } from '../../api/challengeApi';

export function RetryRequestNotification({ challengeId, onComplete }) {
  const [loading, setLoading] = useState(false);

  const handleResponse = async (approved) => {
    setLoading(true);
    try {
      await respondToRetryRequest(challengeId, approved);
      onComplete?.();
    } catch (error) {
      console.error('Error responding to retry request:', error);
      Alert.alert('Error', 'Failed to respond to retry request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Retry Request</Text>
      <Text style={styles.description}>
        A player has requested to retry their move. Do you approve?
      </Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.approveButton]}
          onPress={() => handleResponse(true)}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Approve</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.denyButton]}
          onPress={() => handleResponse(false)}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Deny</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  denyButton: {
    backgroundColor: '#FF5722',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
