import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { memo, useState, useRef, useCallback, useEffect } from "react";
import { Video, AVPlaybackStatus, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

/** Playback speed for slow-mo (0.25 = 4x slower) */
const SLOW_MO_SPEED = 0.25;
/** Normal playback speed */
const NORMAL_SPEED = 1.0;

interface SlowMoReplayProps {
  /** URL of the video clip to replay */
  clipUrl: string;
  /** Optional trick name to display */
  trickName?: string | null;
  /** Whether to show slow-mo by default */
  defaultSlowMo?: boolean;
  /** Callback when slow-mo is toggled */
  onSlowMoToggle?: (isSlowMo: boolean) => void;
  /** Optional style overrides */
  style?: object;
  /** Whether the video should auto-play */
  autoPlay?: boolean;
}

/**
 * SlowMoReplay component for dispute resolution in S.K.A.T.E. battles.
 *
 * Features:
 * - Toggle between 1x (normal) and 0.25x (4x slower) playback
 * - Play/pause controls
 * - Seek forward/backward by 2 seconds
 * - Visual indicator of current playback speed
 *
 * Usage:
 * Used in the judging phase when players need to carefully review
 * whether a trick was landed or bailed. The slow-mo helps resolve
 * disputes by showing the landing frame-by-frame.
 */
export const SlowMoReplay = memo(function SlowMoReplay({
  clipUrl,
  trickName,
  defaultSlowMo = false,
  onSlowMoToggle,
  style,
  autoPlay = true,
}: SlowMoReplayProps) {
  const videoRef = useRef<Video>(null);
  const [isSlowMo, setIsSlowMo] = useState(defaultSlowMo);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);

  // Apply playback speed when slow-mo mode changes
  useEffect(() => {
    const applySpeed = async () => {
      if (videoRef.current) {
        try {
          const speed = isSlowMo ? SLOW_MO_SPEED : NORMAL_SPEED;
          await videoRef.current.setRateAsync(speed, true);
        } catch (err) {
          if (__DEV__) console.error("[SlowMoReplay] Failed to set playback rate:", err);
        }
      }
    };
    applySpeed();
  }, [isSlowMo]);

  // Handle playback status updates
  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(status.isPlaying);
      setPositionMillis(status.positionMillis);
      setDurationMillis(status.durationMillis || 0);
      setError(null);
    } else if (status.error) {
      setIsLoading(false);
      setError("Failed to load video");
      if (__DEV__) console.error("[SlowMoReplay] Playback error:", status.error);
    }
  }, []);

  // Toggle slow-mo mode
  const handleToggleSlowMo = useCallback(() => {
    const newValue = !isSlowMo;
    setIsSlowMo(newValue);
    onSlowMoToggle?.(newValue);
  }, [isSlowMo, onSlowMoToggle]);

  // Toggle play/pause
  const handleTogglePlay = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    } catch (err) {
      if (__DEV__) console.error("[SlowMoReplay] Failed to toggle playback:", err);
    }
  }, [isPlaying]);

  // Seek backward by 2 seconds
  const handleSeekBack = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const newPosition = Math.max(0, positionMillis - 2000);
      await videoRef.current.setPositionAsync(newPosition);
    } catch (err) {
      if (__DEV__) console.error("[SlowMoReplay] Failed to seek:", err);
    }
  }, [positionMillis]);

  // Seek forward by 2 seconds
  const handleSeekForward = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const newPosition = Math.min(durationMillis, positionMillis + 2000);
      await videoRef.current.setPositionAsync(newPosition);
    } catch (err) {
      if (__DEV__) console.error("[SlowMoReplay] Failed to seek:", err);
    }
  }, [positionMillis, durationMillis]);

  // Restart video from beginning
  const handleRestart = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      await videoRef.current.setPositionAsync(0);
      await videoRef.current.playAsync();
    } catch (err) {
      if (__DEV__) console.error("[SlowMoReplay] Failed to restart:", err);
    }
  }, []);

  // Format time as M:SS
  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progress = durationMillis > 0 ? (positionMillis / durationMillis) * 100 : 0;

  if (error) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={SKATE.colors.blood} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Retry loading video"
            style={styles.retryButton}
            onPress={() => setError(null)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Trick name header */}
      {trickName && (
        <View style={styles.trickNameContainer}>
          <Text style={styles.trickName}>{trickName}</Text>
        </View>
      )}

      {/* Speed indicator badge */}
      <View style={styles.speedBadge}>
        <Text style={styles.speedBadgeText}>{isSlowMo ? "4x SLOW-MO" : "NORMAL"}</Text>
      </View>

      {/* Video player */}
      <View style={styles.videoWrapper}>
        <Video
          ref={videoRef}
          source={{ uri: clipUrl }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          shouldPlay={autoPlay}
          rate={isSlowMo ? SLOW_MO_SPEED : NORMAL_SPEED}
          onPlaybackStatusUpdate={handlePlaybackStatus}
          onLoadStart={() => setIsLoading(true)}
        />

        {/* Loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={SKATE.colors.orange} />
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(positionMillis)}</Text>
          <Text style={styles.timeText}>{formatTime(durationMillis)}</Text>
        </View>
      </View>

      {/* Playback controls */}
      <View style={styles.controls}>
        {/* Restart button */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Restart video"
          style={styles.controlButton}
          onPress={handleRestart}
        >
          <Ionicons name="refresh" size={24} color={SKATE.colors.white} />
        </TouchableOpacity>

        {/* Seek backward button */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Rewind 2 seconds"
          style={styles.controlButton}
          onPress={handleSeekBack}
        >
          <Ionicons name="play-back" size={24} color={SKATE.colors.white} />
        </TouchableOpacity>

        {/* Play/Pause button */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
          style={styles.playButton}
          onPress={handleTogglePlay}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={32} color={SKATE.colors.white} />
        </TouchableOpacity>

        {/* Seek forward button */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel="Forward 2 seconds"
          style={styles.controlButton}
          onPress={handleSeekForward}
        >
          <Ionicons name="play-forward" size={24} color={SKATE.colors.white} />
        </TouchableOpacity>

        {/* Slow-mo toggle button */}
        <TouchableOpacity
          accessible
          accessibilityRole="button"
          accessibilityLabel={isSlowMo ? "Switch to normal speed" : "Switch to slow motion"}
          accessibilityState={{ selected: isSlowMo }}
          style={[styles.controlButton, isSlowMo && styles.slowMoActive]}
          onPress={handleToggleSlowMo}
        >
          <Ionicons
            name="speedometer"
            size={24}
            color={isSlowMo ? SKATE.colors.ink : SKATE.colors.white}
          />
        </TouchableOpacity>
      </View>

      {/* Slow-mo instructions */}
      <Text style={styles.instructions}>
        {isSlowMo
          ? "Playing at 4x slower speed to review landing"
          : "Tap speedometer to enable slow-mo replay"}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    overflow: "hidden",
  },
  trickNameContainer: {
    padding: SKATE.spacing.md,
    backgroundColor: SKATE.colors.darkGray,
    alignItems: "center",
  },
  trickName: {
    color: SKATE.colors.orange,
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  speedBadge: {
    position: "absolute",
    top: SKATE.spacing.md,
    right: SKATE.spacing.md,
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
    zIndex: 10,
  },
  speedBadgeText: {
    color: SKATE.colors.white,
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  videoWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: SKATE.colors.ink,
    position: "relative",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  progressContainer: {
    paddingHorizontal: SKATE.spacing.md,
    paddingTop: SKATE.spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: SKATE.colors.darkGray,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: SKATE.colors.orange,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SKATE.spacing.xs,
  },
  timeText: {
    color: SKATE.colors.lightGray,
    fontSize: 12,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: SKATE.spacing.md,
    padding: SKATE.spacing.md,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SKATE.colors.orange,
    justifyContent: "center",
    alignItems: "center",
  },
  slowMoActive: {
    backgroundColor: SKATE.colors.neon,
  },
  instructions: {
    color: SKATE.colors.lightGray,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: SKATE.spacing.md,
    paddingBottom: SKATE.spacing.md,
  },
  errorContainer: {
    padding: SKATE.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  errorText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    marginTop: SKATE.spacing.md,
    marginBottom: SKATE.spacing.lg,
  },
  retryButton: {
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.xl,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
    justifyContent: "center",
  },
  retryText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "bold",
  },
});

export default SlowMoReplay;
