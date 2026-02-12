import { useEffect, useRef } from "react";
import {
  View,
  Animated,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { SKATE } from "@/theme";

interface SkeletonProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A single shimmer placeholder block.
 * Pulses between two opacity levels to indicate loading.
 */
export function Skeleton({
  width,
  height,
  borderRadius = SKATE.borderRadius.md,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: SKATE.colors.darkGray,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ── Pre-built skeleton layouts for each screen ──────────────────────────

/**
 * Skeleton for a single leaderboard row (rank + avatar + name/stats + points).
 */
function LeaderboardRowSkeleton() {
  return (
    <View style={skeletonStyles.leaderboardRow}>
      <Skeleton width={24} height={24} borderRadius={4} />
      <Skeleton
        width={40}
        height={40}
        borderRadius={20}
        style={{ marginHorizontal: SKATE.spacing.md }}
      />
      <View style={{ flex: 1 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={40} height={18} />
    </View>
  );
}

export function LeaderboardSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.leaderboardHeader}>
        <Skeleton width={140} height={24} />
      </View>
      {Array.from({ length: 8 }).map((_, i) => (
        <LeaderboardRowSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Skeleton for a single challenge card.
 */
function ChallengeCardSkeleton() {
  return (
    <View style={skeletonStyles.challengeCard}>
      <View style={skeletonStyles.challengeCardHeader}>
        <Skeleton width="50%" height={14} />
        <Skeleton width={60} height={20} borderRadius={SKATE.borderRadius.sm} />
      </View>
      <Skeleton width="40%" height={16} style={{ marginTop: SKATE.spacing.sm }} />
      <Skeleton width="55%" height={12} style={{ marginTop: SKATE.spacing.xs }} />
    </View>
  );
}

export function ChallengesSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {Array.from({ length: 5 }).map((_, i) => (
        <ChallengeCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Skeleton for the map screen — a full-screen placeholder while spots load.
 */
export function MapSkeleton() {
  return (
    <View style={skeletonStyles.mapContainer}>
      <Skeleton width="100%" height={400} borderRadius={0} />
      <View style={skeletonStyles.mapLegend}>
        <Skeleton width={80} height={12} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={skeletonStyles.mapLegendRow}>
            <Skeleton width={12} height={12} borderRadius={6} />
            <Skeleton width={50} height={10} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Skeleton for a single user card (avatar + name + challenge button).
 */
function UserCardSkeleton() {
  return (
    <View style={skeletonStyles.userCard}>
      <Skeleton width={50} height={50} borderRadius={25} />
      <View style={{ flex: 1, marginLeft: SKATE.spacing.md }}>
        <Skeleton width="55%" height={14} />
      </View>
      <Skeleton width={44} height={44} borderRadius={22} />
    </View>
  );
}

export function UsersSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Search bar placeholder */}
      <View style={skeletonStyles.usersSearchBar}>
        <Skeleton width="100%" height={40} borderRadius={SKATE.borderRadius.md} />
      </View>
      {Array.from({ length: 6 }).map((_, i) => (
        <UserCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Skeleton for the TrickMint clip grid (2-column).
 */
function ClipCardSkeleton() {
  return (
    <View style={skeletonStyles.clipCard}>
      <Skeleton width="100%" height={160} borderRadius={0} />
      <View style={{ padding: SKATE.spacing.sm }}>
        <Skeleton width="70%" height={12} />
        <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function TrickMintSkeleton() {
  return (
    <View style={skeletonStyles.clipGrid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <ClipCardSkeleton key={i} />
      ))}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const skeletonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
    paddingHorizontal: SKATE.spacing.lg,
    paddingTop: SKATE.spacing.lg,
  },

  // Leaderboard
  leaderboardHeader: {
    padding: SKATE.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
    marginHorizontal: -SKATE.spacing.lg,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SKATE.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.grime,
  },

  // Challenges
  challengeCard: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    marginBottom: SKATE.spacing.md,
  },
  challengeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Map
  mapContainer: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  mapLegend: {
    position: "absolute",
    bottom: SKATE.spacing.lg,
    left: SKATE.spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
    gap: SKATE.spacing.xs,
  },
  mapLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },

  // Users
  usersSearchBar: {
    marginBottom: SKATE.spacing.lg,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    marginBottom: SKATE.spacing.md,
  },

  // TrickMint
  clipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
    padding: SKATE.spacing.lg,
  },
  clipCard: {
    width: "48%",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    overflow: "hidden",
  },
});

export default Skeleton;
