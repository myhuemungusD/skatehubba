import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { styles } from "./TrickRecorder.styles";

interface RecordingControlsProps {
  videoUri: string | null;
  recording: boolean;
  isUploading: boolean;
  uploadProgress: number;
  isSettingTrick: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRetake: () => void;
  onSubmit: () => void;
}

export function RecordingControls({
  videoUri,
  recording,
  isUploading,
  uploadProgress,
  isSettingTrick,
  onStartRecording,
  onStopRecording,
  onRetake,
  onSubmit,
}: RecordingControlsProps) {
  const instructionText = recording
    ? "Recording... Stop when done"
    : videoUri
      ? "Review your trick and submit when ready"
      : isSettingTrick
        ? "Record the trick your opponent must match"
        : "Attempt to land the same trick";

  return (
    <>
      {/* Controls */}
      <View style={styles.controls}>
        {!videoUri ? (
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel={recording ? "Stop recording" : "Start recording"}
            accessibilityState={{ selected: recording }}
            style={[styles.recordButton, recording && styles.recordingButton]}
            onPress={recording ? onStopRecording : onStartRecording}
          >
            <Ionicons
              name={recording ? "stop" : "videocam"}
              size={36}
              color={SKATE.colors.white}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Retake video"
              accessibilityState={{ disabled: isUploading }}
              style={styles.actionButton}
              onPress={onRetake}
              disabled={isUploading}
            >
              <Ionicons name="refresh" size={24} color={SKATE.colors.white} />
              <Text style={styles.actionButtonText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel={isSettingTrick ? "Set this trick" : "Submit attempt"}
              accessibilityState={{ disabled: isUploading }}
              style={[styles.actionButton, styles.submitButton]}
              onPress={onSubmit}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Text style={styles.uploadProgressText}>{uploadProgress}%</Text>
                  <Text style={styles.actionButtonText}>Uploading...</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={isSettingTrick ? "flash" : "checkmark"}
                    size={24}
                    color={SKATE.colors.white}
                  />
                  <Text style={styles.actionButtonText}>
                    {isSettingTrick ? "Set Trick" : "Submit"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>{instructionText}</Text>
      </View>
    </>
  );
}
