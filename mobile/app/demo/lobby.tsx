import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { DEMO_CHALLENGES, DEMO_PLAYERS } from "@/demo/mockData";
import type { SkateLetter } from "@/types";

type ChallengeStatus = "pending" | "accepted" | "completed" | "forfeit";

/**
 * Demo: Game Lobby Screen
 * Shows active challenges, pending invites, and completed games.
 * Demonstrates the matchmaking and game management UI.
 */
export default function DemoLobbyScreen() {
  const renderChallenge = ({ item }: { item: (typeof DEMO_CHALLENGES)[number] }) => {
    const statusConfig = getStatusConfig(item.status as ChallengeStatus);
    const isMyTurn = item.isMyTurn;

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <View style={styles.opponentRow}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{item.opponentName.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.opponentName}>vs. {item.opponentName}</Text>
              <Text style={styles.timeAgo}>{getTimeAgo(item.createdAt)}</Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.badgeText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Letter Progress */}
        {item.status === "accepted" && (
          <View style={styles.letterProgress}>
            <View style={styles.letterRow}>
              <Text style={styles.letterLabel}>You:</Text>
              <LetterDots letters={item.myLetters} />
            </View>
            <View style={styles.letterRow}>
              <Text style={styles.letterLabel}>Opp:</Text>
              <LetterDots letters={item.opponentLetters} />
            </View>
          </View>
        )}

        {/* Turn Indicator */}
        {item.status === "accepted" && (
          <View
            style={[
              styles.turnIndicator,
              isMyTurn ? styles.myTurnIndicator : styles.theirTurnIndicator,
            ]}
          >
            <Ionicons
              name={isMyTurn ? "flash" : "hourglass"}
              size={14}
              color={isMyTurn ? SKATE.colors.orange : SKATE.colors.lightGray}
            />
            <Text style={[styles.turnText, isMyTurn ? styles.myTurnText : styles.theirTurnText]}>
              {isMyTurn ? "Your turn — tap to play" : "Waiting for opponent"}
            </Text>
          </View>
        )}

        {/* Completed result */}
        {item.status === "completed" && (
          <View style={styles.completedResult}>
            <Ionicons
              name={item.myLetters.length === 5 ? "sad" : "trophy"}
              size={16}
              color={item.myLetters.length === 5 ? SKATE.colors.blood : SKATE.colors.gold}
            />
            <Text
              style={[
                styles.completedText,
                {
                  color: item.myLetters.length === 5 ? SKATE.colors.blood : SKATE.colors.gold,
                },
              ]}
            >
              {item.myLetters.length === 5 ? "DEFEAT" : "VICTORY"}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Demo Banner */}
      <View style={styles.demoBanner}>
        <Ionicons name="eye" size={14} color={SKATE.colors.orange} />
        <Text style={styles.demoBannerText}>INVESTOR DEMO — Mock Data</Text>
      </View>

      {/* Create Challenge Button */}
      <TouchableOpacity style={styles.createButton} activeOpacity={0.7}>
        <Ionicons name="add-circle" size={24} color={SKATE.colors.white} />
        <Text style={styles.createButtonText}>New Challenge</Text>
      </TouchableOpacity>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {DEMO_CHALLENGES.filter((c) => c.status === "accepted").length}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {DEMO_CHALLENGES.filter((c) => c.status === "pending").length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{DEMO_PLAYERS.me.gamesWon}</Text>
          <Text style={styles.statLabel}>Won</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{DEMO_PLAYERS.me.gamesPlayed}</Text>
          <Text style={styles.statLabel}>Played</Text>
        </View>
      </View>

      {/* Challenge List */}
      <FlatList
        data={DEMO_CHALLENGES}
        renderItem={renderChallenge}
        keyExtractor={(item: (typeof DEMO_CHALLENGES)[number]) => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function LetterDots({ letters }: { letters: SkateLetter[] }) {
  const allLetters: SkateLetter[] = ["S", "K", "A", "T", "E"];
  return (
    <View style={styles.dotsRow}>
      {allLetters.map((letter) => {
        const active = letters.includes(letter);
        return (
          <View key={letter} style={[styles.letterDot, active && styles.letterDotActive]}>
            <Text style={[styles.letterDotText, active && styles.letterDotTextActive]}>
              {letter}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function getStatusConfig(status: ChallengeStatus) {
  switch (status) {
    case "pending":
      return { label: "PENDING", color: SKATE.colors.gold, bg: "rgba(255, 215, 0, 0.15)" };
    case "accepted":
      return { label: "ACTIVE", color: SKATE.colors.neon, bg: "rgba(0, 255, 65, 0.15)" };
    case "completed":
      return { label: "DONE", color: SKATE.colors.lightGray, bg: SKATE.colors.darkGray };
    case "forfeit":
      return { label: "FORFEIT", color: SKATE.colors.blood, bg: "rgba(255, 26, 26, 0.15)" };
    default:
      return {
        label: String(status).toUpperCase(),
        color: SKATE.colors.gray,
        bg: SKATE.colors.darkGray,
      };
  }
}

function getTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKATE.colors.orange,
    margin: SKATE.spacing.lg,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
    minHeight: 48,
  },
  createButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: "bold",
  },
  statsBar: {
    flexDirection: "row",
    marginHorizontal: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
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
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: SKATE.colors.darkGray,
  },
  list: {
    paddingHorizontal: SKATE.spacing.lg,
    gap: SKATE.spacing.md,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  opponentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: 18,
    fontWeight: "bold",
  },
  opponentName: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  timeAgo: {
    color: SKATE.colors.gray,
    fontSize: 12,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  letterProgress: {
    marginTop: SKATE.spacing.md,
    gap: SKATE.spacing.sm,
  },
  letterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },
  letterLabel: {
    fontSize: 12,
    color: SKATE.colors.lightGray,
    width: 30,
  },
  dotsRow: {
    flexDirection: "row",
    gap: SKATE.spacing.xs,
  },
  letterDot: {
    width: 28,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: SKATE.colors.ink,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    borderRadius: SKATE.borderRadius.sm,
  },
  letterDotActive: {
    backgroundColor: SKATE.colors.blood,
    borderColor: SKATE.colors.blood,
  },
  letterDotText: {
    fontWeight: "bold",
    fontSize: 14,
    color: SKATE.colors.darkGray,
    fontFamily: "monospace",
  },
  letterDotTextActive: {
    color: SKATE.colors.white,
  },
  turnIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginTop: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.sm,
    paddingHorizontal: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.sm,
  },
  myTurnIndicator: {
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 102, 0, 0.3)",
  },
  theirTurnIndicator: {
    backgroundColor: SKATE.colors.ink,
  },
  turnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  myTurnText: {
    color: SKATE.colors.orange,
  },
  theirTurnText: {
    color: SKATE.colors.lightGray,
  },
  completedResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginTop: SKATE.spacing.md,
  },
  completedText: {
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
  },
});
