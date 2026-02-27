import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LeaderboardEntry } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { LeaderboardSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";

function winRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return "0%";
  return `${Math.round((wins / total) * 100)}%`;
}

function LeaderboardRow({ item, index }: { item: LeaderboardEntry; index: number }) {
  const [imgError, setImgError] = useState(false);
  const isTopThree = index < 3;
  const initial = item.displayName?.charAt(0).toUpperCase() || "S";

  return (
    <View
      testID={`leaderboard-row-${index}`}
      style={[styles.row, isTopThree && styles.topThreeRow]}
    >
      <View style={styles.rankContainer}>
        {index === 0 && <Ionicons name="trophy" size={24} color={SKATE.colors.gold} />}
        {index === 1 && <Ionicons name="trophy" size={24} color="#c0c0c0" />}
        {index === 2 && <Ionicons name="trophy" size={24} color="#cd7f32" />}
        {index > 2 && <Text style={styles.rank}>{item.rank}</Text>}
      </View>

      {item.photoURL && !imgError ? (
        <Image
          source={{ uri: item.photoURL }}
          style={styles.avatar}
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name}>{item.displayName}</Text>
        <Text style={styles.stats}>
          {item.wins}W - {item.losses}L · {winRate(item.wins, item.losses)}
        </Text>
      </View>

      <Text style={styles.points}>{item.wins}W</Text>
    </View>
  );
}

function LeaderboardScreenContent() {
  const {
    data: leaderboard,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest<LeaderboardEntry[]>("/api/leaderboard"),
  });

  const renderItem = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => (
      <LeaderboardRow item={item} index={index} />
    ),
    []
  );

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: 64,
      offset: 64 * index,
      index,
    }),
    []
  );

  const hasNoData = !isLoading && (!leaderboard || leaderboard.length === 0);

  return (
    <View testID="leaderboard-screen" style={styles.container}>
      {isLoading ? (
        <LeaderboardSkeleton />
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={64} color={SKATE.colors.blood} />
          <Text style={styles.emptyTitle}>Failed to Load</Text>
          <Text style={styles.emptyText}>
            Could not load the leaderboard. Check your connection and try again.
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Retry loading leaderboard"
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh" size={20} color={SKATE.colors.white} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : hasNoData ? (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={64} color={SKATE.colors.gray} />
          <Text style={styles.emptyTitle}>No Rankings Yet</Text>
          <Text style={styles.emptyText}>Play S.K.A.T.E. challenges to climb the leaderboard!</Text>
        </View>
      ) : (
        <FlatList
          testID="leaderboard-list"
          data={leaderboard}
          renderItem={renderItem}
          keyExtractor={(item) => item.userId}
          getItemLayout={getItemLayout}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text testID="leaderboard-header" style={styles.headerText}>
                S.K.A.T.E. Leaderboard
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={SKATE.colors.orange}
              colors={[SKATE.colors.orange]}
            />
          }
        />
      )}
    </View>
  );
}

export default function LeaderboardScreen() {
  return (
    <ScreenErrorBoundary screenName="Leaderboard">
      <LeaderboardScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  header: {
    padding: SKATE.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  headerText: {
    fontSize: SKATE.fontSize.title,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: SKATE.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.grime,
  },
  topThreeRow: {
    backgroundColor: SKATE.colors.grime,
  },
  rankContainer: {
    width: 40,
    alignItems: "center",
  },
  rank: {
    fontSize: SKATE.fontSize.xl,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.lightGray,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: SKATE.spacing.md,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: SKATE.spacing.md,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
  },
  stats: {
    fontSize: SKATE.fontSize.sm,
    color: SKATE.colors.lightGray,
    marginTop: 2,
  },
  points: {
    fontSize: SKATE.fontSize.xl,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.orange,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SKATE.spacing.xxl,
  },
  emptyTitle: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xxl,
    fontWeight: SKATE.fontWeight.bold,
    marginTop: SKATE.spacing.lg,
  },
  emptyText: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.md,
    textAlign: "center",
    marginTop: SKATE.spacing.sm,
    lineHeight: 20,
  },
  retryButton: {
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
  retryButtonText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
});
