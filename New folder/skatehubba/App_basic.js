import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛹 SkateHubba Web Running</Text>
      <Text style={styles.subtitle}>React Native + Expo build OK</Text>
      <Text style={styles.info}>Expo SDK 50 + React 18.2.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  title: {
    color: '#ff6a00',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#16a34a',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  info: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
});