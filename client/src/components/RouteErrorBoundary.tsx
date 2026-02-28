import { Component, ReactNode, ErrorInfo } from "react";
import * as Sentry from "@sentry/react";
import { Button } from "./ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "../lib/logger";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight per-route error boundary that catches failures within a single
 * page without crashing the entire app. The global ErrorBoundary remains as
 * the last-resort safety net; this component isolates feature-level crashes.
 *
 * Addresses gap 5.4: No per-route error boundaries.
 */
class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
    if (import.meta.env.DEV) {
      logger.error("[RouteErrorBoundary]", error);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center"
          role="alert"
        >
          <AlertTriangle className="h-12 w-12 text-orange-400 mb-4" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
          <p className="text-neutral-400 mb-6 max-w-md">
            {this.props.fallbackMessage ||
              "This section encountered an error. The rest of the app still works."}
          </p>
          <Button onClick={this.handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default RouteErrorBoundary;
