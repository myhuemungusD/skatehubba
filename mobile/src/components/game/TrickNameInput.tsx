import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  FlatList,
  Platform,
  StyleSheet,
} from "react-native";
import { SKATE } from "@/theme";
import { searchTricks } from "@/lib/trickDictionary";
import { styles as recorderStyles } from "./TrickRecorder.styles";

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
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleTextChange = useCallback(
    (text: string) => {
      onChangeTrickName(text);
      setSuggestions(searchTricks(text, 6));
    },
    [onChangeTrickName]
  );

  const handleSelectSuggestion = useCallback(
    (trick: string) => {
      onChangeTrickName(trick);
      setSuggestions([]);
    },
    [onChangeTrickName]
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={recorderStyles.trickInputOverlay}
    >
      <View style={recorderStyles.trickInputCard}>
        <Text style={recorderStyles.trickInputTitle}>Name Your Trick</Text>
        <TextInput
          style={recorderStyles.trickInput}
          placeholder="e.g., Kickflip, Tre flip..."
          placeholderTextColor={SKATE.colors.gray}
          value={trickName}
          onChangeText={handleTextChange}
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={onConfirm}
        />

        {suggestions.length > 0 && (
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionsList}
            renderItem={({ item }) => (
              <TouchableOpacity
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Select ${item}`}
                style={styles.suggestionItem}
                onPress={() => handleSelectSuggestion(item)}
              >
                <Text style={styles.suggestionText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        )}

        <View style={recorderStyles.trickInputButtons}>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Skip naming trick"
            style={recorderStyles.trickInputButtonSecondary}
            onPress={onSkip}
          >
            <Text style={recorderStyles.trickInputButtonTextSecondary}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Confirm trick name"
            style={recorderStyles.trickInputButtonPrimary}
            onPress={onConfirm}
          >
            <Text style={recorderStyles.trickInputButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  suggestionsList: {
    maxHeight: 200,
    marginBottom: SKATE.spacing.md,
    backgroundColor: SKATE.colors.ink,
    borderRadius: SKATE.borderRadius.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  suggestionItem: {
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  suggestionText: {
    color: SKATE.colors.white,
    fontSize: 16,
  },
});
