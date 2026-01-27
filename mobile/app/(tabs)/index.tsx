import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

export default function HomeScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.loadingContainer} testID="home-loading">
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="home-screen">
      {/* Hero Section */}
      <View style={styles.hero}>
        {user ? (
          <>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user.displayName || "Skater"}</Text>
          </>
        ) : (
          <>
            <Text style={styles.heroTitle}>SkateHubba</Text>
            <Text style={styles.heroSubtitle}>Your skateboarding community</Text>
          </>
        )}
      </View>

      {/* Sign In Banner for Guests */}
      {!user && (
        <TouchableOpacity
          style={styles.signInBanner}
          onPress={() => router.push("/auth/sign-in" as any)}
          testID="home-sign-in"
        >
          <View style={styles.signInContent}>
            <Ionicons name="person-circle" size={32} color={SKATE.colors.orange} />
            <View style={styles.signInText}>
              <Text style={styles.signInTitle}>Sign in to unlock all features</Text>
              <Text style={styles.signInSubtitle}>Play S.K.A.T.E., check in at spots, and more</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color={SKATE.colors.gray} />
        </TouchableOpacity>
      )}

      {/* Quick Actions Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/map")}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="map" size={32} color={SKATE.colors.orange} />
            </View>
            <Text style={styles.cardTitle}>Find Spots</Text>
            <Text style={styles.cardDesc}>Discover nearby skate spots</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/challenges")}>
            <View style={[styles.cardIconContainer, styles.playIconContainer]}>
              <Ionicons name="play" size={32} color={SKATE.colors.white} />
            </View>
            <Text style={styles.cardTitle}>Play S.K.A.T.E.</Text>
            <Text style={styles.cardDesc}>Challenge skaters worldwide</Text>
            {!user && <Text style={styles.cardBadge}>Sign in required</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/leaderboard")}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="trophy" size={32} color={SKATE.colors.orange} />
            </View>
            <Text style={styles.cardTitle}>Leaderboard</Text>
            <Text style={styles.cardDesc}>See top skaters</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => router.push("/(tabs)/shop")}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="cart" size={32} color={SKATE.colors.orange} />
            </View>
            <Text style={styles.cardTitle}>Shop</Text>
            <Text style={styles.cardDesc}>Get gear and apparel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* User-specific Quick Actions */}
      {user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Activity</Text>
          <View style={styles.activityList}>
            <TouchableOpacity
              style={styles.activityItem}
              onPress={() => router.push(`/profile/${user.uid}` as any)}
            >
              <View style={styles.activityIcon}>
                <Ionicons name="person" size={20} color={SKATE.colors.orange} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>My Profile</Text>
                <Text style={styles.activitySubtitle}>View your stats and achievements</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.activityItem}
              onPress={() => router.push("/(tabs)/closet")}
            >
              <View style={styles.activityIcon}>
                <Ionicons name="shirt" size={20} color={SKATE.colors.orange} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>My Closet</Text>
                <Text style={styles.activitySubtitle}>Your gear collection</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.activityItem}
              onPress={() => router.push("/(tabs)/users")}
            >
              <View style={styles.activityIcon}>
                <Ionicons name="people" size={20} color={SKATE.colors.orange} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Find Skaters</Text>
                <Text style={styles.activitySubtitle}>Connect with the community</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: SKATE.colors.ink,
  },
  loadingText: {
    color: SKATE.colors.white,
    fontSize: 18,
  },
  hero: {
    padding: SKATE.spacing.xl,
    paddingTop: SKATE.spacing.xxl,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: SKATE.colors.orange,
  },
  heroSubtitle: {
    fontSize: 16,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.xs,
  },
  greeting: {
    fontSize: 16,
    color: SKATE.colors.lightGray,
  },
  userName: {
    fontSize: 28,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  signInBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: SKATE.colors.grime,
    marginHorizontal: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.lg,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.orange,
  },
  signInContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: SKATE.spacing.md,
  },
  signInText: {
    flex: 1,
  },
  signInTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  signInSubtitle: {
    color: SKATE.colors.lightGray,
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.white,
    marginBottom: SKATE.spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
  },
  card: {
    width: "47%",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  cardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SKATE.spacing.md,
  },
  playIconContainer: {
    backgroundColor: SKATE.colors.orange,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
    textAlign: "center",
  },
  cardDesc: {
    fontSize: 12,
    color: SKATE.colors.gray,
    textAlign: "center",
    marginTop: SKATE.spacing.xs,
  },
  cardBadge: {
    fontSize: 10,
    color: SKATE.colors.orange,
    marginTop: SKATE.spacing.sm,
    fontWeight: "600",
  },
  activityList: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    overflow: "hidden",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: SKATE.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SKATE.spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  activitySubtitle: {
    color: SKATE.colors.gray,
    fontSize: 12,
    marginTop: 2,
  },
  bottomPadding: {
    height: 40,
  },
});
