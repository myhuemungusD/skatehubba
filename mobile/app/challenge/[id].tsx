import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase.config";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { SKATE } from "@/theme";
import { VideoErrorBoundary } from "@/components/common/VideoErrorBoundary";
import type { Challenge } from "@/types";

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAuthenticated } = useRequireAuth();
  const router = useRouter();

  const {
    data: challenge,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["challenge", id],
    queryFn: async () => {
      if (!id) throw new Error("No challenge ID");

      const docRef = doc(db, "challenges", id);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        throw new Error("Challenge not found");
      }

      const data = snapshot.data();
      return {
        id: snapshot.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        deadline: data.deadline?.toDate(),
      } as Challenge;
    },
    enabled: !!id && !!user,
  });

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
        <Text style={styles.loadingText}>Loading challenge...</Text>
      </View>
    );
  }

  if (error || !challenge) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={64} color={SKATE.colors.blood} />
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : "Challenge not found"}
        </Text>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back to challenges list"
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = challenge.createdBy === user?.uid;
  const opponentId = isCreator ? challenge.opponent : challenge.createdBy;
  const isPending = challenge.status === "pending";
  const isCompleted = challenge.status === "completed";
  const isForfeit = challenge.status === "forfeit";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={SKATE.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenge</Text>
        <StatusBadge status={challenge.status} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Challenge Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Opponent</Text>
            <Text style={styles.infoValue}>vs. {opponentId}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Deadline</Text>
            <Text style={styles.infoValue}>
              {format(challenge.deadline, "MMM d, yyyy 'at' h:mm a")}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rules</Text>
            <Text style={styles.infoValue}>
              {challenge.rules.oneTake ? "One-take" : "Multiple takes"} &middot;{" "}
              {challenge.rules.durationSec}s max
            </Text>
          </View>

          {isCompleted && challenge.winner && (
            <View style={styles.winnerRow}>
              <Ionicons name="trophy" size={20} color={SKATE.colors.gold} />
              <Text style={styles.winnerText}>
                Winner: {challenge.winner === user?.uid ? "You!" : opponentId}
              </Text>
            </View>
          )}

          {isForfeit && (
            <View style={styles.forfeitRow}>
              <Ionicons name="flag" size={20} color={SKATE.colors.blood} />
              <Text style={styles.forfeitText}>Challenge forfeited</Text>
            </View>
          )}
        </View>

        {/* Clip A - Creator's video */}
        <View style={styles.clipSection}>
          <Text style={styles.clipLabel}>
            {isCreator ? "YOUR CLIP" : "OPPONENT'S CLIP"}
          </Text>
          <VideoErrorBoundary>
            <Video
              source={{ uri: challenge.clipA.url }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping
            />
          </VideoErrorBoundary>
        </View>

        {/* Clip B - Response video */}
        {challenge.clipB && (
          <View style={styles.clipSection}>
            <Text style={styles.clipLabel}>
              {isCreator ? "OPPONENT'S RESPONSE" : "YOUR RESPONSE"}
            </Text>
            <VideoErrorBoundary>
              <Video
                source={{ uri: challenge.clipB.url }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
              />
            </VideoErrorBoundary>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {isPending && !isCreator && (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Record your response to this challenge"
              style={styles.respondButton}
              onPress={() =>
                router.push({
                  pathname: "/challenge/new",
                  params: {
                    opponentUid: challenge.createdBy,
                    challengeId: challenge.id,
                  },
                })
              }
            >
              <Ionicons name="videocam" size={24} color={SKATE.colors.white} />
              <Text style={styles.respondButtonText}>Record Response</Text>
            </TouchableOpacity>
          )}

          {isPending && isCreator && (
            <View style={styles.waitingCard}>
              <ActivityIndicator color={SKATE.colors.orange} />
              <Text style={styles.waitingText}>Waiting for opponent to respond...</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatusBadge({ status }: { status: Challenge["status"] }) {
  const colors = {
    pending: SKATE.colors.orange,
    accepted: "#007aff",
    completed: SKATE.colors.neon,
    forfeit: SKATE.colors.blood,
  };

  return (
    <View style={[styles.badge, { backgroundColor: colors[status] }]}>
      <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  centered: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    justifyContent: "center",
    alignItems: "center",
    gap: SKATE.spacing.lg,
  },
  loadingText: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.lg,
  },
  errorText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    marginTop: SKATE.spacing.md,
  },
  backButton: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  backButtonText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.md,
    backgroundColor: SKATE.colors.grime,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  headerButton: {
    width: SKATE.accessibility.minimumTouchTarget,
    height: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xl,
    fontWeight: SKATE.fontWeight.bold,
  },
  badge: {
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  badgeText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xs,
    fontWeight: SKATE.fontWeight.bold,
  },
  content: {
    padding: SKATE.spacing.lg,
    gap: SKATE.spacing.lg,
  },
  infoCard: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    gap: SKATE.spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.md,
  },
  infoValue: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.md,
    fontWeight: SKATE.fontWeight.semibold,
  },
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    paddingTop: SKATE.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: SKATE.colors.darkGray,
  },
  winnerText: {
    color: SKATE.colors.gold,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  forfeitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    paddingTop: SKATE.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: SKATE.colors.darkGray,
  },
  forfeitText: {
    color: SKATE.colors.blood,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  clipSection: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  clipLabel: {
    color: SKATE.colors.orange,
    fontSize: SKATE.fontSize.sm,
    fontWeight: SKATE.fontWeight.bold,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.sm,
    textAlign: "center",
  },
  video: {
    width: "100%",
    height: 250,
    borderRadius: SKATE.borderRadius.md,
    backgroundColor: SKATE.colors.ink,
  },
  actions: {
    gap: SKATE.spacing.md,
  },
  respondButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  respondButtonText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  waitingText: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.md,
  },
});
