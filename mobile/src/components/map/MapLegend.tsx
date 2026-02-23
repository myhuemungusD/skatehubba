import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SKATE } from "@/theme";

const TIERS = [
  { label: "Bronze", color: "#cd7f32" },
  { label: "Silver", color: "#c0c0c0" },
  { label: "Gold", color: "#ffd700" },
  { label: "Legendary", color: "#ff6600" },
] as const;

export const MapLegend = memo(function MapLegend() {
  return (
    <View testID="map-legend" style={styles.legend}>
      <Text style={styles.legendTitle}>Tier</Text>
      <View style={styles.legendItems}>
        {TIERS.map(({ label, color }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
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
