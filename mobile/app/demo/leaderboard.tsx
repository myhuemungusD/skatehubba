import { View, Text, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { DEMO_LEADERBOARD } from "@/demo/mockData";

/**
 * Demo: Leaderboard Screen
 * Shows S.K.A.T.E. PvP rankings with win/loss records.
 * Uses hardcoded mock data for investor demos.
 */
export default function DemoLeaderboardScreen() {
  const renderItem = ({
    item,
    index,
  }: {
    item: (typeof DEMO_LEADERBOARD)[number];
    index: number;
  }) => {
    const isTopThree = index < 3;
    const isFirst = index === 0;

    return (
      <View
        style={[
          styles.row,
          isTopThree && styles.topThreeRow,
          isFirst && styles.firstRow,
        ]}
      >
        {/* Rank */}
        <View style={styles.rankContainer}>
          {index === 0 && (
            <Ionicons name="trophy" size={28} color={SKATE.colors.gold} />
          )}
          {index === 1 && (
            <Ionicons name="trophy" size={24} color="#c0c0c0" />
          )}
          {index === 2 && (
            <Ionicons name="trophy" size={24} color="#cd7f32" />
          )}
          {index > 2 && (
            <Text style={styles.rank}>{item.rank}</Text>
          )}
        </View>

        {/* Avatar */}
        <View
          style={[
            styles.avatarPlaceholder,
            isFirst && styles.avatarFirst,
          ]}
        >
          <Text
            style={[
              styles.avatarInitial,
              isFirst && styles.avatarInitialFirst,
            ]}
          >
            {item.displayName.charAt(0)}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.name, isFirst && styles.nameFirst]}>
            {item.displayName}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.miniStat}>
              <Ionicons name="trophy" size={12} color={SKATE.colors.gray} />
              <Text style={styles.miniStatText}>{item.wins}W - {item.losses}L</Text>
            </View>
            <View style={styles.miniStat}>
              <Ionicons name="stats-chart" size={12} color={SKATE.colors.gray} />
              <Text style={styles.miniStatText}>
                {item.winRate}%
              </Text>
            </View>
          </View>
        </View>

        {/* Wins */}
        <View style={styles.pointsContainer}>
          <Text
            style={[styles.points, isFirst && styles.pointsFirst]}
          >
            {item.wins}
          </Text>
          <Text style={styles.pointsLabel}>wins</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Demo Banner */}
      <View style={styles.demoBanner}>
        <Ionicons name="eye" size={14} color={SKATE.colors.orange} />
        <Text style={styles.demoBannerText}>INVESTOR DEMO — Mock Data</Text>
      </View>

      <FlatList
        data={DEMO_LEADERBOARD}
        renderItem={renderItem}
        keyExtractor={(item: (typeof DEMO_LEADERBOARD)[number]) => item.userId}
        ListHeaderComponent={
          <View style={styles.header}>
            <Ionicons name="podium" size={32} color={SKATE.colors.gold} />
            <Text style={styles.headerText}>S.K.A.T.E. Leaderboard</Text>
            <Text style={styles.headerSubtext}>
              Who&apos;s winning the most games of S.K.A.T.E.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.xs,
    paddingVertical: SKATE.spacing.sm,
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 102, 0, 0.2)",
  },
  demoBannerText: {
    fontSize: 11,
    fontWeight: "bold",
    color: SKATE.colors.orange,
    letterSpacing: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    padding: SKATE.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
    gap: SKATE.spacing.sm,
  },
  headerText: {
    fontSize: 28,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  headerSubtext: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    textAlign: "center",
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
  firstRow: {
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: SKATE.colors.gold,
  },
  rankContainer: {
    width: 44,
    alignItems: "center",
  },
  rank: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.lightGray,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginHorizontal: SKATE.spacing.md,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarFirst: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: SKATE.colors.gold,
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: 18,
    fontWeight: "bold",
  },
  avatarInitialFirst: {
    fontSize: 22,
    color: SKATE.colors.gold,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  nameFirst: {
    fontSize: 18,
    color: SKATE.colors.gold,
  },
  statsRow: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
    marginTop: 2,
  },
  miniStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniStatText: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
  },
  pointsContainer: {
    alignItems: "flex-end",
  },
  points: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.orange,
  },
  pointsFirst: {
    fontSize: 22,
    color: SKATE.colors.gold,
  },
  pointsLabel: {
    fontSize: 10,
    color: SKATE.colors.gray,
    textTransform: "uppercase",
  },
});
