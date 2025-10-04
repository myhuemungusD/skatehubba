import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';

const demoLobbies = [
  {
    id: 'lobby-1',
    host: 'kickflipkid',
    spot: 'Venice Beach Skatepark',
    skaters: 5,
    spectators: 12,
    isLive: true,
    isPro: true,
  },
  {
    id: 'lobby-2',
    host: 'shop-berrics',
    spot: 'The Berrics',
    skaters: 8,
    spectators: 23,
    isLive: true,
    isPro: false,
  },
  {
    id: 'lobby-3',
    host: 'olliemama',
    spot: 'Local Plaza',
    skaters: 2,
    spectators: 5,
    isLive: false,
    isPro: false,
  },
];

export default function LobbyScreen() {
  const [lobbies, setLobbies] = useState(demoLobbies);

  function handleJoinLobby(id) {
    const lobby = lobbies.find(l => l.id === id);
    alert(
      `Entering lobby at ${lobby.spot}\nHost: @${lobby.host}\nSkaters: ${lobby.skaters}\nSpectators: ${lobby.spectators}`
    );
    // In real app, navigate to lobby detail/chat/spectate
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Lobbies</Text>
      <FlatList
        data={lobbies}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.lobbyCard,
              item.isPro && styles.proCard,
              item.isLive && styles.liveCard,
            ]}
            onPress={() => handleJoinLobby(item.id)}
          >
            <View style={styles.lobbyHeader}>
              <Text style={styles.spot}>{item.spot}</Text>
              {item.isPro && <ProBadge />}
              {item.isLive && <LiveBadge />}
            </View>
            <Text style={styles.host}>Host: @{item.host}</Text>
            <View style={styles.statsRow}>
              <Text style={styles.stat}>🛹 Skaters: {item.skaters}</Text>
              <Text style={styles.stat}>👀 Spectators: {item.spectators}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function ProBadge() {
  return (
    <Text style={{ color: '#e67e22', fontWeight: 'bold', fontSize: 13, marginLeft: 6 }}>
      PRO
    </Text>
  );
}
function LiveBadge() {
  return (
    <Text style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: 13, marginLeft: 10 }}>
      ● LIVE
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 22 },
  title: { fontWeight: 'bold', fontSize: 22, marginBottom: 18 },
  lobbyCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: '#ececec',
    elevation: 1,
  },
  proCard: { borderColor: '#e67e22' },
  liveCard: { borderColor: '#e74c3c' },
  lobbyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  spot: { fontWeight: 'bold', fontSize: 18 },
  host: { fontSize: 14, color: '#666', marginBottom: 7 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { fontSize: 14, color: '#333', marginRight: 20 },
});
