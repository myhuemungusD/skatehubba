import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

interface GameActionAreaProps {
  canRecord: boolean;
  isAttacker: boolean;
  isWaiting: boolean;
  isJudging: boolean;
  isUploading: boolean;
  uploadProgress: number | undefined;
  onRecordTrick: () => void;
  /** Setter bail handler — only shown for attacker during set trick phase */
  onSetterBail?: () => void;
  /** Whether setter bail is in progress */
  setterBailPending?: boolean;
}

export const GameActionArea = memo(function GameActionArea({
  canRecord,
  isAttacker,
  isWaiting,
  isJudging,
  isUploading,
  uploadProgress,
  onRecordTrick,
  onSetterBail,
  setterBailPending,
}: GameActionAreaProps) {
  return (
    <View style={styles.actionArea}>
      {canRecord && (
        <>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel={isAttacker ? "Record trick to set" : "Record your attempt"}
            testID="game-record-trick"
            style={styles.recordButton}
            onPress={onRecordTrick}
            disabled={isUploading}
          >
            {isUploading ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator color={SKATE.colors.white} />
                <Text style={styles.uploadingText}>
                  {uploadProgress ? `${uploadProgress}%` : "Uploading..."}
                </Text>
              </View>
            ) : (
              <>
                <Ionicons name="videocam" size={32} color={SKATE.colors.white} />
                <Text style={styles.recordButtonText}>
                  {isAttacker ? "RECORD TRICK" : "RECORD ATTEMPT"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {isAttacker && !isUploading && (
            <Text style={styles.hintText}>One take. No preview. Auto-sends on stop.</Text>
          )}

          {isAttacker && onSetterBail && !isUploading && (
            <TouchableOpacity
              accessible
              accessibilityRole="button"
              accessibilityLabel="Bail on your own trick and take a letter"
              testID="game-setter-bail"
              style={styles.bailButton}
              onPress={onSetterBail}
              disabled={setterBailPending}
            >
              <Ionicons name="warning" size={20} color={SKATE.colors.orange} />
              <Text style={styles.bailButtonText}>
                {setterBailPending ? "Bailing..." : "I bailed my own trick"}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {isWaiting && !isJudging && (
        <View style={styles.waitingIndicator}>
          <ActivityIndicator color={SKATE.colors.orange} size="large" />
          <Text style={styles.waitingText}>Waiting for opponent...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  actionArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SKATE.spacing.xl,
    gap: SKATE.spacing.md,
  },
  recordButton: {
    backgroundColor: SKATE.colors.blood,
    paddingHorizontal: SKATE.spacing.xxl * 2,
    paddingVertical: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
    borderWidth: 3,
    borderColor: SKATE.colors.white,
    shadowColor: SKATE.colors.blood,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  recordButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  hintText: {
    color: SKATE.colors.gray,
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  bailButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.md,
    borderWidth: 1,
    borderColor: SKATE.colors.orange,
    backgroundColor: "rgba(255, 102, 0, 0.1)",
    marginTop: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  bailButtonText: {
    color: SKATE.colors.orange,
    fontSize: 14,
    fontWeight: "600",
  },
  uploadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
  },
  uploadingText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  waitingIndicator: {
    alignItems: "center",
    gap: SKATE.spacing.lg,
  },
  waitingText: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
  },
});
