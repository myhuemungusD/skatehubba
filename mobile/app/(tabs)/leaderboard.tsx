import { View, Text, StyleSheet, FlatList } from "react-native";
import { Image } from "expo-image";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LeaderboardEntry } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { LeaderboardSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";

function LeaderboardScreenContent() {
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest<LeaderboardEntry[]>("/api/leaderboard"),
  });

  const renderItem = useCallback(({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isTopThree = index < 3;

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

        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {item.displayName?.charAt(0).toUpperCase() || "S"}
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Text style={styles.stats}>
            {item.totalPoints} pts · {item.spotsUnlocked} spots
          </Text>
        </View>

        <Text style={styles.points}>{item.totalPoints}</Text>
      </View>
    );
  }, []);

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: 64,
      offset: 64 * index,
      index,
    }),
    []
  );

  return (
    <View testID="leaderboard-screen" style={styles.container}>
      {isLoading ? (
        <LeaderboardSkeleton />
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
                Top Skaters
              </Text>
            </View>
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
});
