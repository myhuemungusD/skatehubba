import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function VerificationBadge({ type }) {
  // type: 'pro', 'shop', 'flow', or undefined
  let badgeText = '✔️';
  let badgeColor = '#4a90e2';
  if (type === 'pro') {
    badgeText = 'PRO';
    badgeColor = '#e67e22';
  } else if (type === 'shop') {
    badgeText = 'SHOP';
    badgeColor = '#4a90e2';
  } else if (type === 'flow') {
    badgeText = 'FLOW';
    badgeColor = '#43B581';
  }
  return (
    <View style={[styles.badge, { backgroundColor: badgeColor }]}> 
      <Text style={styles.badgeText}>{badgeText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 5 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});
