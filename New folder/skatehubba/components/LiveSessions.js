import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { getLiveSessions } from '../api/sessions';

// Mock data for demo; replace with getLiveSessions() Firestore query
const mockSessions = [
  {
    id: "s1",
    hostName: "NollieKing",
    hostAvatar: "https://i.pravatar.cc/150?img=5",
    spotName: "Redlands Skatepark",
    isLive: true,
    isFull: false,
    skaterCount: 5,
    spectatorCount: 2,
  },
  {
    id: "s2",
    hostName: "LaceEmUp",
    hostAvatar: "https://i.pravatar.cc/150?img=12",
    spotName: "Santa Ana Ledge",
    isLive: true,
    isFull: true,
    skaterCount: 10,
    spectatorCount: 6,
  },
  {
    id: "s3",
    hostName: "Jamie",
    hostAvatar: "https://i.pravatar.cc/150?img=7",
    spotName: "Hollenbeck Park",
    isLive: true,
    isFull: false,
    skaterCount: 3,
    spectatorCount: 12,
  },
  {
    id: "s4",
    hostName: "Dre",
    hostAvatar: "https://i.pravatar.cc/150?img=9",
    spotName: "Hollywood High",
    isLive: false,
    isFull: false,
    skaterCount: 2,
    spectatorCount: 0,
  },
];

export default function LiveSessions({ onSpectate, onJoin }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with real backend call
    // getLiveSessions().then(data => { setSessions(data); setLoading(false); });
    setTimeout(() => {
      setSessions(mockSessions);
      setLoading(false);
    }, 800);
  }, []);

  if (loading) return (
    <View style={{ height: 160, justifyContent: "center" }}>
      <ActivityIndicator color="#FFD600" size="large" />
    </View>
  );

  return (
    <View style={{ paddingVertical: 12 }}>
      <Text style={styles.heading}>Live Sessions</Text>
      <FlatList
        horizontal
        data={sessions}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 10, paddingRight: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.card, item.isFull && { opacity: 0.55 }]}>
            <Image source={{ uri: item.hostAvatar }} style={styles.avatar} />
            <Text style={styles.host}>{item.hostName}</Text>
            <Text style={styles.spot}>{item.spotName}</Text>
            <View style={styles.statusRow}>
              <Text style={[styles.status, item.isLive ? styles.live : styles.waiting]}>
                {item.isLive ? "LIVE" : "WAITING"}
              </Text>
              <FontAwesome5 name="users" size={13} color="#FFD600" style={{ marginLeft: 6 }} />
              <Text style={styles.counts}>
                {item.skaterCount} <FontAwesome5 name="eye" size={11} color="#FFD600" /> {item.spectatorCount}
              </Text>
            </View>
            {item.isFull ? (
              <TouchableOpacity style={[styles.fullBtn]} disabled>
                <Text style={{ color: "#aaa", fontWeight: "bold" }}>Full</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.spectateBtn}
                  onPress={() => onSpectate(item)}
                >
                  <Text style={{ color: "#222", fontWeight: "bold" }}>Spectate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.joinBtn}
                  onPress={() => onJoin(item)}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Join</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: "#FFD600", fontWeight: "bold", fontSize: 18, marginLeft: 8, marginBottom: 6 },
  card: {
    width: 140, marginRight: 16, backgroundColor: "#23262b", borderRadius: 14,
    padding: 10, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.09, shadowRadius: 5,
  },
  avatar: { width: 42, height: 42, borderRadius: 22, marginBottom: 4, backgroundColor: "#ccc" },
  host: { fontWeight: "bold", color: "#FFF", fontSize: 14, marginBottom: 1 },
  spot: { color: "#FFD600", fontSize: 12, marginBottom: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  status: { fontWeight: "bold", fontSize: 12 },
  live: { color: "#FFD600" },
  waiting: { color: "#aaa" },
  counts: { color: "#FFD600", fontSize: 12, marginLeft: 4 },
  spectateBtn: {
    marginTop: 4, backgroundColor: "#FFD600", borderRadius: 7, paddingVertical: 3, paddingHorizontal: 16,
    alignItems: "center",
  },
  joinBtn: {
    marginTop: 5, backgroundColor: "#222", borderRadius: 7, paddingVertical: 3, paddingHorizontal: 22,
    alignItems: "center",
  },
  fullBtn: {
    marginTop: 10, backgroundColor: "#888", borderRadius: 7, paddingVertical: 5, paddingHorizontal: 24,
    alignItems: "center",
  },
});
