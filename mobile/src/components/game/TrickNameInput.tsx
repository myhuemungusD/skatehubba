import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SKATE } from "@/theme";
import { styles } from "./TrickRecorder.styles";

interface TrickNameInputProps {
  trickName: string;
  onChangeTrickName: (name: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}

export function TrickNameInput({
  trickName,
  onChangeTrickName,
  onConfirm,
  onSkip,
}: TrickNameInputProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.trickInputOverlay}
    >
      <View style={styles.trickInputCard}>
        <Text style={styles.trickInputTitle}>Name Your Trick</Text>
        <TextInput
          style={styles.trickInput}
          placeholder="e.g., Kickflip, Tre flip..."
          placeholderTextColor={SKATE.colors.gray}
          value={trickName}
          onChangeText={onChangeTrickName}
          autoFocus
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={onConfirm}
        />
        <View style={styles.trickInputButtons}>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Skip naming trick"
            style={styles.trickInputButtonSecondary}
            onPress={onSkip}
          >
            <Text style={styles.trickInputButtonTextSecondary}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Confirm trick name"
            style={styles.trickInputButtonPrimary}
            onPress={onConfirm}
          >
            <Text style={styles.trickInputButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
