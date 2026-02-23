import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SKATE } from "@/theme";
import { LetterIndicator } from "./LetterIndicator";
import type { SkateLetter } from "@/types";

interface PlayersSectionProps {
  player1Letters: SkateLetter[];
  player1DisplayName: string;
  player1Id: string;
  player2Letters: SkateLetter[];
  player2DisplayName: string;
  player2Id: string;
  currentUserId: string | undefined;
  currentAttacker: string;
}

export const PlayersSection = memo(function PlayersSection({
  player1Letters,
  player1DisplayName,
  player1Id,
  player2Letters,
  player2DisplayName,
  player2Id,
  currentUserId,
  currentAttacker,
}: PlayersSectionProps) {
  return (
    <View style={styles.playersSection}>
      <LetterIndicator
        letters={player1Letters}
        playerName={player1DisplayName}
        isCurrentPlayer={player1Id === currentUserId}
        isAttacker={currentAttacker === player1Id}
      />

      <View style={styles.vsContainer}>
        <Text style={styles.vsText}>VS</Text>
      </View>

      <LetterIndicator
        letters={player2Letters}
        playerName={player2DisplayName}
        isCurrentPlayer={player2Id === currentUserId}
        isAttacker={currentAttacker === player2Id}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  playersSection: {
    flexDirection: "row",
    padding: SKATE.spacing.lg,
    gap: SKATE.spacing.sm,
    alignItems: "flex-start",
  },
  vsContainer: {
    justifyContent: "center",
    paddingTop: SKATE.spacing.xxl,
  },
  vsText: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.gray,
  },
});
