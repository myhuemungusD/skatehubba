import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';

const demoSessions = [
  {
    id: 'sesh-1',
    title: 'Game of SKATE at Venice',
    host: 'kickflipkid',
    isVerified: true,
    isPro: true,
    status: 'live',
    players: 6,
    spectators: 14,
  },
  {
    id: 'sesh-2',
    title: 'Bronson Bearings Jam',
    host: 'shop-berrics',
    isVerified: true,
    isPro: false,
    status: 'waiting',
    players: 3,
    spectators: 7,
  },
  {
    id: 'sesh-3',
    title: 'Chill S.K.A.T.E. at Local Park',
    host: 'olliemama',
    isVerified: false,
    isPro: false,
    status: 'live',
    players: 2,
    spectators: 3,
  },
];

export default function SessionsScreen() {
  const [sessions, setSessions] = useState(demoSessions);

  function joinSession(id) {
    // Later: actual join/spectate logic
    alert('Joining session: ' + sessions.find(s => s.id === id).title);
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Live Sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.sessionCard,
              item.isVerified && styles.verifiedCard,
              item.isPro && styles.proCard,
            ]}
            onPress={() => joinSession(item.id)}
          >
            <Text style={styles.sessionTitle}>
              {item.title} {item.isVerified && <VerifiedBadge />} {item.isPro && <ProBadge />}
            </Text>
            <Text style={styles.sessionInfo}>
              Host: @{item.host} | Players: {item.players} | Spectators: {item.spectators}
            </Text>
            <Text style={[styles.status, item.status === 'live' ? styles.live : styles.waiting]}>
              {item.status === 'live' ? 'LIVE' : 'WAITING'}
            </Text>
          </TouchableOpacity>
        )}
      />
    </ScrollView>
  );
}

function VerifiedBadge() {
  return <Text style={{ color: '#4a90e2', fontWeight: 'bold', fontSize: 15 }}>✔️</Text>;
}

function ProBadge() {
  return <Text style={{ color: '#e67e22', fontWeight: 'bold', fontSize: 15, marginLeft: 2 }}>PRO</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 20 },
  title: { fontWeight: 'bold', fontSize: 22, marginVertical: 18 },
  sessionCard: {
    backgroundColor: '#f7f7f7',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    elevation: 1,
  },
  verifiedCard: { borderColor: '#4a90e2', borderWidth: 2 },
  proCard: { borderColor: '#e67e22', borderWidth: 2 },
  sessionTitle: { fontWeight: 'bold', fontSize: 17, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  sessionInfo: { fontSize: 13, color: '#666', marginBottom: 5 },
  status: { fontWeight: 'bold', fontSize: 13, alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6 },
  live: { color: '#fff', backgroundColor: '#e74c3c' },
  waiting: { color: '#fff', backgroundColor: '#888' },
});
