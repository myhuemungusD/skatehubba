import { memo, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import type { Spot } from "@/types";
import { getTierColor } from "@/lib/getTierColor";

interface SpotDetailModalProps {
  spot: Spot | null;
  onClose: () => void;
  onCheckIn: (spot: Spot) => Promise<void>;
}

export const SpotDetailModal = memo(function SpotDetailModal({
  spot,
  onClose,
  onCheckIn,
}: SpotDetailModalProps) {
  const handleCheckIn = useCallback(async () => {
    if (!spot) return;
    await onCheckIn(spot);
    onClose();
  }, [spot, onCheckIn, onClose]);

  if (!spot) return null;

  const tierValue = spot.tier ?? "bronze";

  return (
    <Modal visible={!!spot} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close spot details"
            style={styles.modalClose}
            onPress={onClose}
          >
            <Ionicons name="close" size={24} color={SKATE.colors.white} />
          </TouchableOpacity>

          <Text testID="map-spot-title" style={styles.modalTitle}>
            {spot.name}
          </Text>
          <Text style={styles.modalDescription}>{spot.description ?? ""}</Text>

          <View style={styles.modalDifficulty}>
            <View style={[styles.legendDot, { backgroundColor: getTierColor(spot.tier) }]} />
            <Text style={styles.modalDifficultyText}>
              {tierValue.charAt(0).toUpperCase() + tierValue.slice(1)}
            </Text>
          </View>

          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Check in at this spot"
            testID="map-check-in"
            style={styles.checkInButton}
            onPress={handleCheckIn}
          >
            <Ionicons name="location" size={20} color={SKATE.colors.white} />
            <Text style={styles.checkInButtonText}>Check In Here</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: SKATE.colors.grime,
    borderTopLeftRadius: SKATE.borderRadius.lg,
    borderTopRightRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xl,
    paddingBottom: 40,
  },
  modalClose: {
    position: "absolute",
    top: SKATE.spacing.lg,
    right: SKATE.spacing.lg,
    zIndex: 1,
    minWidth: SKATE.accessibility.minimumTouchTarget,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: SKATE.spacing.md,
    marginTop: SKATE.spacing.lg,
  },
  modalDescription: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: SKATE.spacing.lg,
  },
  modalDifficulty: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.xl,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalDifficultyText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  checkInButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  checkInButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
});
