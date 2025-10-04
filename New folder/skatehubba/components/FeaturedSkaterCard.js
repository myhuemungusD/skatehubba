import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import ChallengeButton from '../components/ChallengeButton';

// Example: Quick Challenge Card for Featured Skaters
export default function FeaturedSkaterCard({ skater, onChallenge }) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: skater.avatarUrl }} style={styles.avatar} />
      <Text style={styles.name}>{skater.username}</Text>
      <Text style={styles.rank}>#{skater.rank} Globally</Text>
      <ChallengeButton 
        onPress={() => onChallenge(skater)}
        style={styles.challengeButtonOverride}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#242a2f',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    margin: 8,
    borderWidth: 2,
    borderColor: '#FFD600',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  name: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  rank: {
    color: '#FFD600',
    fontSize: 12,
    marginBottom: 8,
  },
  challengeButtonOverride: {
    backgroundColor: '#FFD600',
    borderColor: '#222',
  },
});
