import { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { showMessage } from "react-native-flash-message";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SKATE } from "@/theme";

// Spot types and tiers from shared schema
const SPOT_TYPES = [
  "rail",
  "ledge",
  "stairs",
  "gap",
  "bank",
  "manual-pad",
  "flat",
  "bowl",
  "mini-ramp",
  "vert",
  "diy",
  "park",
  "street",
  "other",
] as const;

const SPOT_TIERS = ["bronze", "silver", "gold", "legendary"] as const;

const SPOT_TYPE_LABELS: Record<string, string> = {
  rail: "🛤️ Rail",
  ledge: "🧱 Ledge",
  stairs: "🪜 Stairs",
  gap: "🌉 Gap",
  bank: "🏔️ Bank",
  "manual-pad": "📦 Manual Pad",
  flat: "🛹 Flat Ground",
  bowl: "🏗️ Bowl",
  "mini-ramp": "🛝 Mini Ramp",
  vert: "⬆️ Vert",
  diy: "🔨 DIY",
  park: "🏞️ Skate Park",
  street: "🛣️ Street",
  other: "❓ Other",
};

const TIER_LABELS: Record<string, string> = {
  bronze: "🥉 Bronze - Local spot",
  silver: "🥈 Silver - Worth the trip",
  gold: "🥇 Gold - Must skate",
  legendary: "🏆 Legendary - Iconic",
};

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number; accuracy?: number } | null;
}

type InsertSpot = {
  name: string;
  description?: string;
  spotType: (typeof SPOT_TYPES)[number];
  tier: (typeof SPOT_TIERS)[number];
  lat: number;
  lng: number;
};

export function AddSpotModal({ isOpen, onClose, userLocation }: AddSpotModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotType, setSpotType] = useState<(typeof SPOT_TYPES)[number]>("street");
  const [tier, setTier] = useState<(typeof SPOT_TIERS)[number]>("bronze");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showTierPicker, setShowTierPicker] = useState(false);

  const isLocationReady = Boolean(
    userLocation && userLocation.lat !== 0 && userLocation.lng !== 0
  );

  const mutation = useMutation({
    mutationFn: async (payload: InsertSpot) => {
      return apiRequest("/api/spots", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
      showMessage({
        message: "🎉 Spot Saved!",
        description: "Your spot is now live on the map. Thanks for contributing!",
        type: "success",
        duration: 3000,
      });
      handleClose();
    },
    onError: (error) => {
      showMessage({
        message: "Unable to save spot",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "danger",
        duration: 3000,
      });
    },
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setSpotType("street");
    setTier("bronze");
    setShowTypePicker(false);
    setShowTierPicker(false);
    onClose();
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showMessage({
        message: "Name Required",
        description: "Give this spot a name before saving.",
        type: "warning",
        duration: 2000,
      });
      return;
    }

    if (!userLocation || !isLocationReady) {
      showMessage({
        message: "Location Required",
        description: "We need your location to pin the spot.",
        type: "warning",
        duration: 2000,
      });
      return;
    }

    const payload: InsertSpot = {
      name: trimmedName,
      description: description.trim() || undefined,
      spotType,
      tier,
      lat: userLocation.lat,
      lng: userLocation.lng,
    };

    mutation.mutate(payload);
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.modalClose} onPress={handleClose}>
            <Ionicons name="close" size={24} color={SKATE.colors.white} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Ionicons name="location" size={24} color={SKATE.colors.orange} />
              <Text style={styles.modalTitle}>Add New Spot</Text>
            </View>
            <Text style={styles.subtitle}>
              Add a spot at your current location. Fill in the details below.
            </Text>

            {/* Location indicator */}
            {isLocationReady && userLocation && (
              <View style={styles.locationIndicator}>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                <Text style={styles.locationText}>
                  {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                </Text>
              </View>
            )}

            {!isLocationReady && (
              <View style={[styles.locationIndicator, styles.locationPending]}>
                <ActivityIndicator size="small" color={SKATE.colors.orange} />
                <Text style={[styles.locationText, { color: SKATE.colors.orange }]}>
                  Getting your location...
                </Text>
              </View>
            )}

            {/* Spot Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Spot Name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Love Park, Hollywood High"
                placeholderTextColor={SKATE.colors.gray}
                style={styles.input}
                maxLength={100}
                autoFocus
              />
            </View>

            {/* Spot Type */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Spot Type</Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => setShowTypePicker(!showTypePicker)}
              >
                <Text style={styles.pickerText}>{SPOT_TYPE_LABELS[spotType]}</Text>
                <Ionicons
                  name={showTypePicker ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={SKATE.colors.lightGray}
                />
              </TouchableOpacity>
              {showTypePicker && (
                <View style={styles.pickerOptions}>
                  <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                    {SPOT_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.pickerOption,
                          spotType === type && styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          setSpotType(type);
                          setShowTypePicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            spotType === type && styles.pickerOptionTextSelected,
                          ]}
                        >
                          {SPOT_TYPE_LABELS[type]}
                        </Text>
                        {spotType === type && (
                          <Ionicons name="checkmark" size={20} color={SKATE.colors.orange} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Tier */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>How good is it?</Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => setShowTierPicker(!showTierPicker)}
              >
                <Text style={styles.pickerText}>{TIER_LABELS[tier]}</Text>
                <Ionicons
                  name={showTierPicker ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={SKATE.colors.lightGray}
                />
              </TouchableOpacity>
              {showTierPicker && (
                <View style={styles.pickerOptions}>
                  {SPOT_TIERS.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.pickerOption,
                        tier === t && styles.pickerOptionSelected,
                      ]}
                      onPress={() => {
                        setTier(t);
                        setShowTierPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          tier === t && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {TIER_LABELS[t]}
                      </Text>
                      {tier === t && (
                        <Ionicons name="checkmark" size={20} color={SKATE.colors.orange} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What makes this spot special? Any tips for other skaters?"
                placeholderTextColor={SKATE.colors.gray}
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={4}
                maxLength={1000}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/1000</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={handleClose}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  (!name.trim() || !isLocationReady || mutation.isPending) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!name.trim() || !isLocationReady || mutation.isPending}
              >
                {mutation.isPending ? (
                  <ActivityIndicator size="small" color={SKATE.colors.white} />
                ) : (
                  <Text style={styles.buttonPrimaryText}>💾 Save Spot</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

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
    maxHeight: "90%",
  },
  modalClose: {
    position: "absolute",
    top: SKATE.spacing.lg,
    right: SKATE.spacing.lg,
    zIndex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    marginTop: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.sm,
  },
  modalTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: "bold",
  },
  subtitle: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    marginBottom: SKATE.spacing.lg,
  },
  locationIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    padding: SKATE.spacing.md,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: SKATE.borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    marginBottom: SKATE.spacing.lg,
  },
  locationPending: {
    backgroundColor: "rgba(255, 106, 0, 0.1)",
    borderColor: "rgba(255, 106, 0, 0.3)",
  },
  locationText: {
    color: "#10b981",
    fontSize: 12,
    flex: 1,
  },
  formGroup: {
    marginBottom: SKATE.spacing.lg,
  },
  label: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: SKATE.spacing.sm,
  },
  input: {
    backgroundColor: SKATE.colors.ink,
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    color: SKATE.colors.white,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: SKATE.spacing.md,
  },
  charCount: {
    color: SKATE.colors.gray,
    fontSize: 12,
    marginTop: SKATE.spacing.xs,
    textAlign: "right",
  },
  picker: {
    backgroundColor: SKATE.colors.ink,
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    color: SKATE.colors.white,
    fontSize: 16,
  },
  pickerOptions: {
    backgroundColor: SKATE.colors.ink,
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.sm,
    maxHeight: 200,
  },
  pickerScroll: {
    maxHeight: 200,
  },
  pickerOption: {
    padding: SKATE.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.gray,
  },
  pickerOptionSelected: {
    backgroundColor: "rgba(255, 106, 0, 0.1)",
  },
  pickerOptionText: {
    color: SKATE.colors.white,
    fontSize: 14,
  },
  pickerOptionTextSelected: {
    color: SKATE.colors.orange,
    fontWeight: "600",
  },
  buttonGroup: {
    flexDirection: "row",
    gap: SKATE.spacing.md,
    marginTop: SKATE.spacing.xl,
  },
  button: {
    flex: 1,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: SKATE.colors.orange,
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: SKATE.colors.gray,
  },
  buttonDisabled: {
    backgroundColor: SKATE.colors.gray,
    opacity: 0.5,
  },
  buttonPrimaryText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonSecondaryText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
