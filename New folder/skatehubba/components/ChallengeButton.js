import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";

// Reusable Challenge Button
export default function ChallengeButton({ onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.challengeBtn, style]}
      onPress={onPress}
      accessibilityLabel="Challenge this skater"
      accessibilityHint="Opens the challenge options"
    >
      <FontAwesome5 name="sword" size={18} color="#FFD600" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  challengeBtn: {
    backgroundColor: "#23262b",
    borderRadius: 18,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFD600",
    elevation: 3,
    shadowColor: "#FFD600",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    marginTop: 6,
  },
});
