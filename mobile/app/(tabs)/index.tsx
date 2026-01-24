import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";

export default function HomeScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.container} testID="home-loading">
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container} testID="home-unauth">
        <Text style={styles.title}>Welcome to SkateHubba</Text>
        <Text style={styles.subtitle}>Sign in to start your skateboarding journey</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/auth/sign-in" as any)}
          testID="home-sign-in"
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="home-screen">
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome back, {user.displayName || "Skater"}! 🛹</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/map")}>
          <Ionicons name="map" size={48} color="#ff6600" />
          <Text style={styles.cardTitle}>Find Spots</Text>
          <Text style={styles.cardDesc}>Discover nearby skate spots</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/challenges")}>
          <Ionicons name="videocam" size={48} color="#ff6600" />
          <Text style={styles.cardTitle}>S.K.A.T.E.</Text>
          <Text style={styles.cardDesc}>Challenge skaters worldwide</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/leaderboard")}>
          <Ionicons name="trophy" size={48} color="#ff6600" />
          <Text style={styles.cardTitle}>Leaderboard</Text>
          <Text style={styles.cardDesc}>See top skaters</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/profile/${user.uid}` as any)}
        >
          <Ionicons name="person" size={48} color="#ff6600" />
          <Text style={styles.cardTitle}>Profile</Text>
          <Text style={styles.cardDesc}>View your stats</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    padding: 20,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
    gap: 12,
  },
  card: {
    width: "47%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 12,
  },
  cardDesc: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#ff6600",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#ff6600",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignSelf: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  loadingText: {
    color: "#fff",
    fontSize: 18,
  },
});
