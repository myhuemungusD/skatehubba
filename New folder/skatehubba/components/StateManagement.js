import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

export const LoadingScreen = ({ message = 'Loading...' }) => (
  <View style={styles.container}>
    <ActivityIndicator size="large" color="#0000ff" />
    <Text style={styles.message}>{message}</Text>
  </View>
);

export const ErrorScreen = ({ 
  error, 
  onRetry = null,
  message = 'Something went wrong'
}) => (
  <View style={styles.container}>
    <Text style={styles.errorTitle}>{message}</Text>
    <Text style={styles.errorMessage}>{error?.message}</Text>
    {onRetry && (
      <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Try Again</Text>
      </TouchableOpacity>
    )}
  </View>
);

export const EmptyState = ({ 
  message = 'No items found',
  icon = null,
  action = null 
}) => (
  <View style={styles.container}>
    {icon}
    <Text style={styles.emptyMessage}>{message}</Text>
    {action}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  message: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#3498db',
    borderRadius: 5,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
});
