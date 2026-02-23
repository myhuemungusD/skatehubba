import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SKATE } from "@/theme";
import { getTierColor } from "@/lib/getTierColor";
import type { Spot } from "@/types";

const TIERS: readonly { label: string; tier: NonNullable<Spot["tier"]> }[] = [
  { label: "Bronze", tier: "bronze" },
  { label: "Silver", tier: "silver" },
  { label: "Gold", tier: "gold" },
  { label: "Legendary", tier: "legendary" },
];

export const MapLegend = memo(function MapLegend() {
  return (
    <View testID="map-legend" style={styles.legend}>
      <Text style={styles.legendTitle}>Tier</Text>
      <View style={styles.legendItems}>
        {TIERS.map(({ label, tier }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: getTierColor(tier) }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  legend: {
    position: "absolute",
    bottom: SKATE.spacing.lg,
    left: SKATE.spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
  },
  legendTitle: {
    color: SKATE.colors.white,
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: SKATE.spacing.sm,
  },
  legendItems: {
    gap: SKATE.spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: SKATE.colors.lightGray,
    fontSize: 11,
  },
});
