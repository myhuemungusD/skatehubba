import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { SKATE } from "@/theme";

interface UserProfile {
  photoURL?: string;
  displayName?: string;
  email?: string;
  totalPoints?: number;
  spotsUnlocked?: number;
  currentStreak?: number;
}

const createChallenge = httpsCallable(functions, "createChallenge");

export default function ProfileScreen() {
  const { uid } = useLocalSearchParams();
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const isOwnProfile = uid === currentUser?.uid;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/profile", uid],
    queryFn: () => apiRequest<UserProfile>(`/api/profile/${uid}`),
  });

  const _mutation = useMutation({
    mutationFn: async ({ clipUrl, thumbnailUrl }: { clipUrl: string; thumbnailUrl: string }) => {
      const res = await createChallenge({
        opponentUid: uid,
        clipUrl,
        thumbnailUrl,
      });
      return res.data;
    },
    onSuccess: () => showMessage({ message: "Challenge sent 🔥", type: "success" }),
    onError: (e: Error) => showMessage({ message: e?.message || "Failed", type: "danger" }),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{ uri: profile?.photoURL || "https://via.placeholder.com/100" }}
          style={styles.avatar}
        />
        <Text style={styles.name}>{profile?.displayName || "Skater"}</Text>
        <Text style={styles.email}>{profile?.email}</Text>

        {!isOwnProfile && (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Challenge this skater"
            style={styles.challengeButton}
            onPress={() =>
              router.push({
                pathname: "/challenge/new",
                params: { opponentUid: uid },
              })
            }
          >
            <Ionicons name="videocam" size={20} color={SKATE.colors.white} />
            <Text style={styles.challengeButtonText}>Challenge</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stats}>
        <StatCard icon="trophy" label="Points" value={profile?.totalPoints || 0} />
        <StatCard icon="location" label="Spots" value={profile?.spotsUnlocked || 0} />
        <StatCard icon="flame" label="Streak" value={profile?.currentStreak || 0} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color="#666" />
          <Text style={styles.emptyText}>No recent activity</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: number;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={32} color="#ff6600" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: "#ff6600",
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  email: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },
  challengeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: SKATE.colors.blood,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  challengeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 24,
  },
  statCard: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    color: "#666",
    fontSize: 14,
    marginTop: 12,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 32,
  },
});
