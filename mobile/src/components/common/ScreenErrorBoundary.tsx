import { Component, type ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";

interface ScreenErrorBoundaryProps {
  children: ReactNode;
  /** Screen name shown in the fallback UI */
  screenName?: string;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Catch-all error boundary for tab screens.
 * Prevents a crash in one screen from killing the entire app.
 * Displays a branded fallback with a retry button.
 */
export class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  constructor(props: ScreenErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): ScreenErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "An unexpected error occurred",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[ScreenErrorBoundary${this.props.screenName ? ` – ${this.props.screenName}` : ""}] Caught error:`,
      error,
      errorInfo
    );
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View
          style={styles.container}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`Something went wrong${this.props.screenName ? ` on the ${this.props.screenName} screen` : ""}. Tap retry to reload.`}
        >
          <View style={styles.iconContainer}>
            <Ionicons
              name="warning"
              size={48}
              color={SKATE.colors.orange}
            />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          {this.props.screenName && (
            <Text style={styles.screenName}>{this.props.screenName}</Text>
          )}
          <Text style={styles.message}>{this.state.errorMessage}</Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Retry loading screen"
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
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: SKATE.colors.ink,
    paddingHorizontal: SKATE.spacing.xxl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SKATE.colors.grime,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SKATE.spacing.xl,
  },
  title: {
    fontSize: SKATE.fontSize.xxl,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
    marginBottom: SKATE.spacing.sm,
  },
  screenName: {
    fontSize: SKATE.fontSize.sm,
    color: SKATE.colors.lightGray,
    marginBottom: SKATE.spacing.md,
  },
  message: {
    fontSize: SKATE.fontSize.md,
    color: SKATE.colors.gray,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SKATE.spacing.xl,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.orange,
    paddingHorizontal: SKATE.spacing.xl,
    paddingVertical: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  retryText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.semibold,
  },
});

export default ScreenErrorBoundary;
