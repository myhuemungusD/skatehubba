import { Component, ReactNode, ErrorInfo } from "react";
import * as Sentry from "@sentry/react";
import { Link } from "wouter";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/card";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { logger } from "../lib/logger";

interface Props {
  children: ReactNode;
  resetKey?: string | number;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.resetError();
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Send error to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });

    // Log to console in development
    if (import.meta.env.DEV) {
      logger.error("Error Boundary caught error:", error);
      logger.error("Component stack:", errorInfo.componentStack);
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReset = () => {
    this.resetError();
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div
          className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center p-4"
          role="alert"
          aria-live="assertive"
        >
          <Card className="max-w-2xl w-full border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-full bg-destructive/10" aria-hidden="true">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Oops! Something went wrong</CardTitle>
                  <CardDescription className="mt-1">
                    Don't worry, we've been notified and are looking into it.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {isDev && this.state.error && (
                <div className="space-y-3">
                  <div className="bg-muted p-4 rounded-lg border">
                    <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                      Error Details (Development Only)
                    </h3>
                    <code className="text-xs text-destructive block break-all">
                      {this.state.error.toString()}
                    </code>
                  </div>

                  {this.state.errorInfo?.componentStack && (
                    <details className="bg-muted p-4 rounded-lg border">
                      <summary className="font-semibold text-sm text-muted-foreground cursor-pointer">
                        Component Stack
                      </summary>
                      <pre className="text-xs mt-2 overflow-auto max-h-60">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  You can try refreshing the page or returning to the home page. If the problem
                  persists, please contact support.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex gap-3">
              <Button
                onClick={this.handleReset}
                variant="outline"
                className="flex-1"
                data-testid="button-error-retry"
              >
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                Try Again
              </Button>
              <Button asChild className="flex-1" data-testid="button-error-home">
                <Link href="/" onClick={this.resetError}>
                  <Home className="h-4 w-4 mr-2" aria-hidden="true" />
                  Go Home
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
