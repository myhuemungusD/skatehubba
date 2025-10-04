import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { getNearbySkaters } from "../api/skaters"; // Your Firestore/geohash query
import ChallengeButton from "./ChallengeButton";

// Mock data for demo; replace with backend fetch
const mockSkaters = [
  {
    uid: "1",
    username: "TaytoFlip",
    avatarUrl: "https://i.pravatar.cc/150?img=1",
    level: 6,
    status: "Skating",
    rareGear: true,
  },
  {
    uid: "2",
    username: "LilNollie",
    avatarUrl: "https://i.pravatar.cc/150?img=2",
    level: 3,
    status: "Idle",
    rareGear: false,
  },
  {
    uid: "3",
    username: "Mike V.",
    avatarUrl: "https://i.pravatar.cc/150?img=3",
    level: 8,
    status: "Skating",
    rareGear: true,
  },
  {
    uid: "4",
    username: "Lacey B.",
    avatarUrl: "https://i.pravatar.cc/150?img=4",
    level: 4,
    status: "Live Session",
    rareGear: false,
  },
];

export default function NearbySkaters({ onChallenge, onProfile }) {
  const [skaters, setSkaters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with getNearbySkaters() real backend call
    // getNearbySkaters().then(data => { setSkaters(data); setLoading(false); });
    setTimeout(() => {
      setSkaters(mockSkaters);
      setLoading(false);
    }, 800);
  }, []);

  if (loading) return (
    <View style={{ height: 150, justifyContent: "center" }}>
      <ActivityIndicator color="#FFD600" size="large" />
    </View>
  );

  return (
    <View style={{ paddingVertical: 12 }}>
      <Text style={styles.heading}>Nearby Skaters</Text>
      <FlatList
        horizontal
        data={skaters}
        keyExtractor={item => item.uid}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 10, paddingRight: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onProfile?.(item)}>
            <View>
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              {item.rareGear && (
                <View style={styles.rareRing}>
                  <FontAwesome5 name="star" size={16} color="#FFD600" />
                </View>
              )}
            </View>
            <Text style={styles.name}>{item.username}</Text>
            <Text style={styles.level}>Lvl {item.level}</Text>
            <Text style={styles.status}>{item.status}</Text>
            <ChallengeButton 
              onPress={(e) => { e.stopPropagation(); onChallenge(item); }}
            />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: "#FFD600", fontWeight: "bold", fontSize: 18, marginLeft: 8, marginBottom: 6 },
  card: {
    width: 115, backgroundColor: "#242a2f", borderRadius: 14,
    marginRight: 14, padding: 12, alignItems: "center", position: "relative",
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3,
  },
  avatar: { width: 54, height: 54, borderRadius: 28, backgroundColor: "#bbb", marginBottom: 7 },
  rareRing: {
    position: "absolute", top: 0, right: 0, backgroundColor: "#222", borderRadius: 12,
    padding: 2, borderColor: "#FFD600", borderWidth: 1,
  },
  name: { fontWeight: "bold", color: "#FFF", marginBottom: 2, fontSize: 14 },
  level: { color: "#FFD600", fontSize: 12, marginBottom: 1 },
  status: { color: "#FFD600", fontSize: 11, marginBottom: 6 },
});
