import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
  Linking
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { analyticsService, EventCategory } from '../services/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ERROR_KEY = '@last_error';
const ERROR_COUNT_KEY = '@error_count';
const MAX_ERRORS_BEFORE_RESET = 3;
const ERROR_RESET_TIMEOUT = 1000 * 60 * 5; // 5 minutes

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      shouldShowReset: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  async componentDidMount() {
    try {
      const errorCount = await AsyncStorage.getItem(ERROR_COUNT_KEY);
      if (errorCount) {
        this.setState({ errorCount: parseInt(errorCount, 10) });
      }
    } catch (e) {
      console.warn('Failed to load error count:', e);
    }
  }

  async componentDidCatch(error, errorInfo) {
    try {
      // Update error count
      const currentCount = this.state.errorCount + 1;
      await AsyncStorage.setItem(ERROR_COUNT_KEY, currentCount.toString());
      
      // Store error details
      await AsyncStorage.setItem(LAST_ERROR_KEY, JSON.stringify({
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      }));

      this.setState({
        errorInfo,
        errorCount: currentCount,
        shouldShowReset: currentCount >= MAX_ERRORS_BEFORE_RESET
      });

      // Log error to analytics and Sentry
      analyticsService.logError(error, {
        category: EventCategory.ERROR,
        errorInfo,
        componentStack: errorInfo.componentStack,
        errorCount: currentCount,
        platform: Platform.OS,
        version: Platform.Version,
        appVersion: this.props.appVersion || 'unknown',
      });

      // Send to Sentry with enhanced context
      Sentry.withScope(scope => {
        scope.setExtra('componentStack', errorInfo.componentStack);
        scope.setExtra('errorCount', currentCount);
        scope.setExtra('deviceInfo', {
          platform: Platform.OS,
          version: Platform.Version,
          appVersion: this.props.appVersion || 'unknown',
          screenDimensions: Dimensions.get('window')
        });
        Sentry.captureException(error);
      });
    } catch (e) {
      console.error('Error in componentDidCatch:', e);
    }
  }

  handleRestart = async () => {
    try {
      // Check if we need to do a full reset
      if (this.state.shouldShowReset) {
        await AsyncStorage.multiRemove([ERROR_COUNT_KEY, LAST_ERROR_KEY]);
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null,
          errorCount: 0,
          shouldShowReset: false
        });
      } else {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null
        });
      }

      // Call onReset callback if provided
      if (this.props.onReset) {
        this.props.onReset();
      }
    } catch (e) {
      console.error('Error in handleRestart:', e);
    }
  };

  handleReportIssue = async () => {
    try {
      const errorDetails = this.state.error?.toString() || 'Unknown error';
      const errorStack = this.state.error?.stack || '';
      const deviceInfo = `
        Platform: ${Platform.OS}
        Version: ${Platform.Version}
        App Version: ${this.props.appVersion || 'unknown'}
      `;

      const mailtoUrl = `mailto:support@skatehubba.com?subject=App Error Report&body=Error Details:\n${errorDetails}\n\nDevice Info:\n${deviceInfo}\n\nStack Trace:\n${errorStack}`;
      
      await Linking.openURL(mailtoUrl);
    } catch (e) {
      console.error('Error reporting issue:', e);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.container}>
            <Text style={styles.title}>Oops! Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.shouldShowReset
                ? "We've detected multiple errors. A reset might help fix the issue."
                : "We're sorry for the inconvenience. Please try again."}
            </Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, this.state.shouldShowReset && styles.resetButton]}
                onPress={this.handleRestart}
              >
                <Text style={styles.buttonText}>
                  {this.state.shouldShowReset ? 'Reset App' : 'Try Again'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.reportButton]}
                onPress={this.handleReportIssue}
              >
                <Text style={styles.buttonText}>Report Issue</Text>
              </TouchableOpacity>
            </View>

            {__DEV__ && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>Debug Information</Text>
                <Text style={styles.errorDetails}>
                  {this.state.error?.toString()}
                </Text>
                <Text style={styles.stackTrace}>
                  {this.state.error?.stack}
                </Text>
                <Text style={styles.componentStack}>
                  {this.state.errorInfo?.componentStack}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: Dimensions.get('window').height,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#FF3B30',
  },
  reportButton: {
    backgroundColor: '#32ADE6',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  debugContainer: {
    width: '100%',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    marginTop: 20,
  },
  debugTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorDetails: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 8,
  },
  stackTrace: {
    color: '#666',
    fontSize: 12,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
    }),
    marginBottom: 8,
  },
  componentStack: {
    color: '#666',
    fontSize: 12,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
    }),
  },
});

export default Sentry.withErrorBoundary(ErrorBoundary, {
  showDialog: true,
});
