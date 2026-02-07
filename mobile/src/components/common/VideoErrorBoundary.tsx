import { Component, type ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

interface VideoErrorBoundaryProps {
  children: ReactNode;
  /** Callback when retry is pressed */
  onRetry?: () => void;
  /** Custom fallback component */
  fallback?: ReactNode;
}

interface VideoErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error boundary specifically for Video components.
 * Catches errors from expo-av Video and displays a fallback UI.
 */
export class VideoErrorBoundary extends Component<
  VideoErrorBoundaryProps,
  VideoErrorBoundaryState
> {
  constructor(props: VideoErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): VideoErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Video failed to load",
    };
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.errorContainer}>
          <Ionicons
            name="videocam-off"
            size={48}
            color={SKATE.colors.lightGray}
          />
          <Text style={styles.errorTitle}>Video Unavailable</Text>
          <Text style={styles.errorMessage}>
            {this.state.errorMessage}
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Retry loading video"
            style={styles.retryButton}
            onPress={this.handleRetry}
          >
            <Ionicons name="refresh" size={20} color={SKATE.colors.white} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.md,
    padding: SKATE.spacing.xl,
    gap: SKATE.spacing.md,
    minHeight: 200,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  errorMessage: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.lg,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.md,
  },
  retryText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
});

export default VideoErrorBoundary;
