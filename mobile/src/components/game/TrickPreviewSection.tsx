import { memo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { SKATE } from "@/theme";
import { VideoErrorBoundary } from "@/components/common/VideoErrorBoundary";

interface TrickPreviewSectionProps {
  trickName: string | null | undefined;
  videoUrl: string | null;
  videoIsLoading: boolean;
}

export const TrickPreviewSection = memo(function TrickPreviewSection({
  trickName,
  videoUrl,
  videoIsLoading,
}: TrickPreviewSectionProps) {
  return (
    <View style={styles.trickPreview}>
      <Text style={styles.trickPreviewTitle}>TRICK TO MATCH</Text>
      {trickName && <Text style={styles.trickName}>{trickName}</Text>}
      <VideoErrorBoundary>
        {videoIsLoading ? (
          <ActivityIndicator color={SKATE.colors.orange} style={styles.previewVideo} />
        ) : videoUrl ? (
          <Video
            source={{ uri: videoUrl }}
            style={styles.previewVideo}
            shouldPlay
            useNativeControls
            isLooping
            resizeMode={ResizeMode.CONTAIN}
          />
        ) : null}
      </VideoErrorBoundary>
    </View>
  );
});

const styles = StyleSheet.create({
  trickPreview: {
    margin: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
    borderWidth: 2,
    borderColor: SKATE.colors.orange,
  },
  trickPreviewTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: SKATE.colors.orange,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.sm,
    textAlign: "center",
  },
  trickName: {
    fontSize: 18,
    fontWeight: "bold",
    color: SKATE.colors.white,
    textAlign: "center",
    marginBottom: SKATE.spacing.md,
  },
  previewVideo: {
    width: "100%",
    height: 200,
    borderRadius: SKATE.borderRadius.md,
    backgroundColor: SKATE.colors.ink,
  },
});
