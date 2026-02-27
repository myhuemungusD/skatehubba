import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { MapSkeleton } from "@/components/common/Skeleton";
import { getTierColor } from "@/lib/getTierColor";
import type { Spot } from "@/types";

interface SpotListFallbackProps {
  spots: Spot[] | undefined;
  isLoading: boolean;
  onAddSpot: () => void;
  onSelectSpot: (spot: Spot) => void;
}

export const SpotListFallback = memo(function SpotListFallback({
  spots,
  isLoading,
  onAddSpot,
  onSelectSpot,
}: SpotListFallbackProps) {
  return (
    <>
      <View style={styles.expoGoBanner}>
        <Ionicons name="information-circle" size={20} color={SKATE.colors.orange} />
        <Text style={styles.expoGoBannerText}>
          Map view requires a dev build. Showing spots as a list.
        </Text>
      </View>

      <TouchableOpacity
        testID="map-add-spot"
        style={styles.expoGoAddButton}
        onPress={onAddSpot}
        accessibilityLabel="Add new skate spot"
      >
        <Ionicons name="add" size={20} color={SKATE.colors.white} />
        <Text style={styles.expoGoAddButtonText}>Add Spot</Text>
      </TouchableOpacity>

      {isLoading ? (
        <MapSkeleton />
      ) : (
        <FlatList
          data={spots ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.spotList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No spots yet. Be the first to add one!</Text>
          }
          renderItem={({ item: spot }) => (
            <TouchableOpacity style={styles.spotCard} onPress={() => onSelectSpot(spot)}>
              <View style={[styles.legendDot, { backgroundColor: getTierColor(spot.tier) }]} />
              <View style={styles.spotCardContent}>
                <Text style={styles.spotCardName}>{spot.name}</Text>
                {spot.description ? (
                  <Text style={styles.spotCardDesc} numberOfLines={1}>
                    {spot.description}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
            </TouchableOpacity>
          )}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  expoGoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.md,
    margin: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  expoGoBannerText: {
    color: SKATE.colors.lightGray,
    fontSize: 13,
    flex: 1,
  },
  expoGoAddButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.sm,
    paddingHorizontal: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    alignSelf: "flex-end",
    marginRight: SKATE.spacing.md,
    marginBottom: SKATE.spacing.sm,
  },
  expoGoAddButtonText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "bold",
  },
  spotList: {
    padding: SKATE.spacing.md,
    gap: SKATE.spacing.sm,
  },
  spotCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    gap: SKATE.spacing.md,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  spotCardContent: {
    flex: 1,
  },
  spotCardName: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  spotCardDesc: {
    color: SKATE.colors.lightGray,
    fontSize: 13,
    marginTop: 2,
  },
  emptyText: {
    color: SKATE.colors.gray,
    fontSize: 14,
    textAlign: "center",
    marginTop: SKATE.spacing.xl,
  },
});
