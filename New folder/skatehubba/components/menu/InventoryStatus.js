import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';

export function InventoryStatus({ hardware, bearings }) {
  const [fontsLoaded] = useFonts({
    'PressStart2P': require('../../assets/fonts/PressStart2P-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hardware: x{hardware}</Text>
      <Text style={styles.text}>Bearings: x{bearings}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF5722',
  },
  text: {
    color: '#FFF',
    fontFamily: 'PressStart2P',
    fontSize: 12,
    marginVertical: 4,
    textShadowColor: '#FF5722',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
});
