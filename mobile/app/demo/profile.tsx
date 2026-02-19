import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { DEMO_PLAYERS } from "@/demo/mockData";
import type { ComponentProps } from "react";

/**
 * Demo: Player Profile Screen
 * Shows detailed player stats, recent battle history, and challenge button.
 * Demonstrates the social/competitive player profile experience.
 */
export default function DemoProfileScreen() {
  const player = DEMO_PLAYERS.me;

  const recentBattles = [
    { opponent: "Nyjah Huston", result: "won" as const, tricks: 7, date: "2h ago" },
    { opponent: "Rodney Mullen", result: "won" as const, tricks: 5, date: "1d ago" },
    { opponent: "Leticia Bufoni", result: "lost" as const, tricks: 8, date: "2d ago" },
    { opponent: "Yuto Horigome", result: "won" as const, tricks: 6, date: "3d ago" },
    { opponent: "Chris Joslin", result: "won" as const, tricks: 4, date: "5d ago" },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Demo Banner */}
      <View style={styles.demoBanner}>
        <Ionicons name="eye" size={14} color={SKATE.colors.orange} />
        <Text style={styles.demoBannerText}>INVESTOR DEMO — Mock Profile</Text>
      </View>

      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{player.displayName.charAt(0)}</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>PRO</Text>
          </View>
        </View>

        <Text style={styles.displayName}>{player.displayName}</Text>
        <Text style={styles.email}>{player.email}</Text>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.challengeButton} activeOpacity={0.7}>
            <Ionicons name="videocam" size={20} color={SKATE.colors.white} />
            <Text style={styles.challengeButtonText}>Challenge</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.followButton} activeOpacity={0.7}>
            <Ionicons name="person-add" size={20} color={SKATE.colors.orange} />
            <Text style={styles.followButtonText}>Follow</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsSection}>
        <View style={styles.statsGrid}>
          <StatCard
            icon="trophy"
            value={player.totalPoints.toLocaleString()}
            label="Points"
            color={SKATE.colors.gold}
          />
          <StatCard
            icon="flame"
            value={`${player.currentStreak}`}
            label="Win Streak"
            color={SKATE.colors.orange}
          />
          <StatCard
            icon="checkmark-done"
            value={`${player.gamesWon}`}
            label="Wins"
            color={SKATE.colors.neon}
          />
          <StatCard
            icon="game-controller"
            value={`${player.gamesPlayed}`}
            label="Played"
            color="#3b82f6"
          />
          <StatCard
            icon="location"
            value={`${player.spotsUnlocked}`}
            label="Spots"
            color={SKATE.colors.blood}
          />
          <StatCard
            icon="stats-chart"
            value={`${Math.round((player.gamesWon / player.gamesPlayed) * 100)}%`}
            label="Win Rate"
            color={SKATE.colors.gold}
          />
        </View>
      </View>

      {/* Recent Battles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECENT BATTLES</Text>
        {recentBattles.map((battle, index) => (
          <View key={index} style={styles.battleRow}>
            <View
              style={[
                styles.resultIndicator,
                battle.result === "won" ? styles.resultWon : styles.resultLost,
              ]}
            >
              <Ionicons
                name={battle.result === "won" ? "trophy" : "close"}
                size={14}
                color={SKATE.colors.white}
              />
            </View>
            <View style={styles.battleInfo}>
              <Text style={styles.battleOpponent}>vs. {battle.opponent}</Text>
              <Text style={styles.battleDetail}>
                {battle.tricks} tricks · {battle.date}
              </Text>
            </View>
            <Text
              style={[
                styles.battleResult,
                {
                  color: battle.result === "won" ? SKATE.colors.neon : SKATE.colors.blood,
                },
              ]}
            >
              {battle.result.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {/* Achievements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
        <View style={styles.achievementsGrid}>
          <AchievementBadge
            icon="flash"
            title="First Blood"
            description="Win your first S.K.A.T.E. battle"
            unlocked={true}
          />
          <AchievementBadge
            icon="flame"
            title="On Fire"
            description="Win 10 battles in a row"
            unlocked={true}
          />
          <AchievementBadge
            icon="diamond"
            title="Trick Master"
            description="Land 100 tricks"
            unlocked={true}
          />
          <AchievementBadge
            icon="earth"
            title="Globe Trotter"
            description="Unlock 50 spots worldwide"
            unlocked={false}
          />
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AchievementBadge({
  icon,
  title,
  description,
  unlocked,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  unlocked: boolean;
}) {
  return (
    <View style={[styles.achievementCard, !unlocked && styles.achievementLocked]}>
      <View
        style={[
          styles.achievementIcon,
          unlocked ? styles.achievementIconUnlocked : styles.achievementIconLocked,
        ]}
      >
        <Ionicons name={icon} size={24} color={unlocked ? SKATE.colors.gold : SKATE.colors.gray} />
      </View>
      <Text style={[styles.achievementTitle, !unlocked && styles.achievementTitleLocked]}>
        {title}
      </Text>
      <Text style={styles.achievementDesc}>{description}</Text>
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
  profileHeader: {
    alignItems: "center",
    padding: SKATE.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: SKATE.spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: SKATE.colors.grime,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "bold",
    color: SKATE.colors.orange,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: SKATE.colors.gold,
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: 2,
    borderRadius: SKATE.borderRadius.sm,
    borderWidth: 2,
    borderColor: SKATE.colors.ink,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "bold",
    color: SKATE.colors.ink,
    letterSpacing: 1,
  },
  displayName: {
    fontSize: 28,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  email: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    marginTop: SKATE.spacing.xs,
    marginBottom: SKATE.spacing.lg,
  },
  actionRow: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
  },
  challengeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.md,
    minHeight: 44,
  },
  challengeButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.grime,
    borderWidth: 1,
    borderColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.md,
    minHeight: 44,
  },
  followButtonText: {
    color: SKATE.colors.orange,
    fontSize: 16,
    fontWeight: "bold",
  },
  statsSection: {
    padding: SKATE.spacing.lg,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
  },
  statCard: {
    width: "30%",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    alignItems: "center",
    gap: SKATE.spacing.xs,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  statLabel: {
    fontSize: 11,
    color: SKATE.colors.lightGray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    padding: SKATE.spacing.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: SKATE.colors.gray,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.md,
  },
  battleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginBottom: SKATE.spacing.sm,
    gap: SKATE.spacing.md,
  },
  resultIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  resultWon: {
    backgroundColor: SKATE.colors.neon,
  },
  resultLost: {
    backgroundColor: SKATE.colors.blood,
  },
  battleInfo: {
    flex: 1,
  },
  battleOpponent: {
    fontSize: 15,
    fontWeight: "600",
    color: SKATE.colors.white,
  },
  battleDetail: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    marginTop: 1,
  },
  battleResult: {
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  achievementsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.md,
  },
  achievementCard: {
    width: "47%",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  achievementLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SKATE.spacing.sm,
  },
  achievementIconUnlocked: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  achievementIconLocked: {
    backgroundColor: SKATE.colors.darkGray,
  },
  achievementTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: SKATE.colors.white,
    textAlign: "center",
  },
  achievementTitleLocked: {
    color: SKATE.colors.gray,
  },
  achievementDesc: {
    fontSize: 11,
    color: SKATE.colors.lightGray,
    textAlign: "center",
    marginTop: 2,
  },
  bottomPadding: {
    height: 40,
  },
});
