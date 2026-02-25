import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase.config";
import { showMessage } from "react-native-flash-message";
import { SKATE } from "@/theme";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { logEvent } from "@/lib/analytics/logEvent";

interface UserProfile {
  photoURL?: string;
  displayName?: string;
  email?: string;
  totalPoints?: number;
  spotsUnlocked?: number;
  currentStreak?: number;
}

const createChallenge = httpsCallable(functions, "createChallenge");

/** Firebase UIDs are 20-128 alphanumeric characters. */
const VALID_UID = /^[a-zA-Z0-9]{20,128}$/;

function ProfileScreenContent() {
  const { uid: rawUid } = useLocalSearchParams<{ uid: string }>();
  const { user: currentUser } = useAuth();
  const router = useRouter();

  const uid = rawUid && VALID_UID.test(rawUid) ? rawUid : null;
  const isInvalidUid = !!rawUid && !uid;
  const isOwnProfile = uid === currentUser?.uid;

  useEffect(() => {
    if (isInvalidUid) {
      logEvent("deep_link_invalid", { raw_id: rawUid, route: "profile" });
    }
  }, [isInvalidUid, rawUid]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/profile", uid],
    queryFn: () => apiRequest<UserProfile>(`/api/profile/${uid}`),
    enabled: !!uid,
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
    onSuccess: () => showMessage({ message: "Challenge sent!", type: "success" }),
    onError: (e: Error) => showMessage({ message: e?.message || "Failed", type: "danger" }),
  });

  if (isInvalidUid) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={SKATE.colors.blood} />
        <Text style={styles.name}>Invalid profile link</Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.challengeButton}
          onPress={() => router.back()}
        >
          <Text style={styles.challengeButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  const displayInitial = profile?.displayName?.charAt(0).toUpperCase() || "S";

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {profile?.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{displayInitial}</Text>
          </View>
        )}
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
          <Ionicons name="time-outline" size={48} color={SKATE.colors.gray} />
          <Text style={styles.emptyText}>No recent activity</Text>
        </View>
      </View>
    </ScrollView>
  );
}

export default function ProfileScreen() {
  return (
    <ScreenErrorBoundary screenName="Profile">
      <ProfileScreenContent />
    </ScreenErrorBoundary>
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
      <Ionicons name={icon} size={32} color={SKATE.colors.orange} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    justifyContent: "center",
    alignItems: "center",
    gap: SKATE.spacing.md,
  },
  header: {
    alignItems: "center",
    padding: SKATE.spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: SKATE.spacing.lg,
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: SKATE.spacing.lg,
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
    backgroundColor: SKATE.colors.grime,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: 40,
    fontWeight: "bold",
  },
  name: {
    fontSize: SKATE.fontSize.title,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
  },
  email: {
    fontSize: SKATE.fontSize.md,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.xs,
  },
  challengeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.lg,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  challengeButtonText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: SKATE.spacing.xxl,
  },
  statCard: {
    alignItems: "center",
  },
  statValue: {
    fontSize: SKATE.fontSize.title,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
    marginTop: SKATE.spacing.sm,
  },
  statLabel: {
    fontSize: SKATE.fontSize.sm,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.xs,
  },
  section: {
    padding: SKATE.spacing.xxl,
  },
  sectionTitle: {
    fontSize: SKATE.fontSize.xxl,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
    marginBottom: SKATE.spacing.lg,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SKATE.spacing.xxl,
  },
  emptyText: {
    color: SKATE.colors.gray,
    fontSize: SKATE.fontSize.md,
    marginTop: SKATE.spacing.md,
  },
  loadingText: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.lg,
  },
});
