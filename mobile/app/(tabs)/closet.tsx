import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";

function ClosetScreenContent() {
  const { user, isAuthenticated, checkAuth } = useRequireAuth();
  const router = useRouter();

  // Unauthenticated users are redirected to sign-in by the root layout guard.
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  // Authenticated user view
  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {user?.displayName?.charAt(0).toUpperCase() || "S"}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.userName}>{user?.displayName || "Skater"}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Wishlist</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push(`/profile/${user?.uid}`)}
          >
            <Ionicons name="person" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>My Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/leaderboard")}
          >
            <Ionicons name="trophy" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>Leaderboard</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push("/(tabs)/users")}>
            <Ionicons name="people" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>Find Skaters</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/(tabs)/settings")}
          >
            <Ionicons name="settings" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* My Collection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Collection</Text>
        <View style={styles.emptyCollection}>
          <Ionicons name="cube-outline" size={48} color={SKATE.colors.gray} />
          <Text style={styles.emptyText}>No items in your closet yet</Text>
          <Text style={styles.emptySubtext}>
            Your purchased gear and saved items will appear here
          </Text>
          <TouchableOpacity style={styles.browseButton} onPress={() => router.push("/(tabs)/shop")}>
            <Text style={styles.browseButtonText}>Browse Shop</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

export default function ClosetScreen() {
  return (
    <ScreenErrorBoundary screenName="My Closet">
      <ClosetScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  profileHeader: {
    alignItems: "center",
    padding: SKATE.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  avatarContainer: {
    marginBottom: SKATE.spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: SKATE.colors.grime,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: 40,
    fontWeight: "bold",
  },
  userName: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: "bold",
  },
  userEmail: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    marginTop: SKATE.spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SKATE.spacing.xl,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: "bold",
  },
  statLabel: {
    color: SKATE.colors.gray,
    fontSize: 12,
    marginTop: SKATE.spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: SKATE.colors.darkGray,
  },
  section: {
    padding: SKATE.spacing.lg,
  },
  sectionTitle: {
    color: SKATE.colors.white,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: SKATE.spacing.md,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
  },
  actionCard: {
    width: "47%",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  actionText: {
    color: SKATE.colors.white,
    fontSize: 14,
    marginTop: SKATE.spacing.sm,
  },
  emptyCollection: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xxl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    borderStyle: "dashed",
  },
  emptyText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
    marginTop: SKATE.spacing.md,
  },
  emptySubtext: {
    color: SKATE.colors.gray,
    fontSize: 14,
    textAlign: "center",
    marginTop: SKATE.spacing.sm,
  },
  browseButton: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.lg,
  },
  browseButtonText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "bold",
  },
  bottomPadding: {
    height: 40,
  },
});
