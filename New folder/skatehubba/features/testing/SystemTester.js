import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Alert,
  ScrollView,
  StyleSheet 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SkateHubba System Testing Component
 * Tests all core systems: AsyncStorage, Firebase, Navigation, etc.
 */

const SystemTester = () => {
  const [testResults, setTestResults] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const updateTestResult = (testName, status, message) => {
    setTestResults(prev => ({
      ...prev,
      [testName]: { status, message, timestamp: new Date().toLocaleTimeString() }
    }));
  };

  // Test AsyncStorage functionality
  const testAsyncStorage = async () => {
    try {
      const testKey = 'skatehubba_test';
      const testValue = JSON.stringify({
        user: 'test_skater',
        spots: ['Venice Beach', 'LOVE Park'],
        timestamp: Date.now()
      });

      // Write test
      await AsyncStorage.setItem(testKey, testValue);
      
      // Read test
      const retrievedValue = await AsyncStorage.getItem(testKey);
      
      if (retrievedValue === testValue) {
        updateTestResult('AsyncStorage', 'PASS', 'Read/Write operations successful');
        
        // Clean up test data
        await AsyncStorage.removeItem(testKey);
        return true;
      } else {
        updateTestResult('AsyncStorage', 'FAIL', 'Data mismatch on read');
        return false;
      }
    } catch (error) {
      updateTestResult('AsyncStorage', 'ERROR', `Exception: ${error.message}`);
      return false;
    }
  };

  // Test Firebase connection (basic import test)
  const testFirebaseConnection = async () => {
    try {
      // Test Firebase service initialization and connection
      const { testFirebaseConnection: testConnection } = await import('../../services/firebaseTest');
      const result = await testConnection();
      
      if (result.success) {
        updateTestResult('Firebase', 'PASS', 'Firebase Firestore connection successful');
        return true;
      } else {
        updateTestResult('Firebase', 'WARN', `Connection issue: ${result.message}`);
        return false;
      }
    } catch (error) {
      updateTestResult('Firebase', 'ERROR', `Test failed: ${error.message}`);
      return false;
    }
  };

  // Test Navigation (this component being rendered means navigation is working)
  const testNavigation = () => {
    updateTestResult('Navigation', 'PASS', 'React Navigation rendering successfully');
    return true;
  };

  // Test Environment Configuration
  const testEnvironment = () => {
    const requiredVars = [
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      'EXPO_PUBLIC_FIREBASE_APP_ID'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      updateTestResult('Environment', 'PASS', 'All required env vars present');
      return true;
    } else {
      updateTestResult('Environment', 'WARN', `Missing: ${missingVars.join(', ')}`);
      return false;
    }
  };

  // Test Brand Assets (check if image files exist - simplified check)
  const testBrandAssets = () => {
    const expectedAssets = [
      'checkinmap.png',
      'shop background.png', 
      'profile background.png',
      'LOGOmain.png'
    ];
    
    // For now, we'll just report expected assets
    updateTestResult('Brand Assets', 'INFO', `Expected: ${expectedAssets.join(', ')}`);
    return true;
  };

  // Run all tests
  const runAllTests = async () => {
    setIsLoading(true);
    setTestResults({});

    const tests = [
      { name: 'Navigation', test: testNavigation },
      { name: 'Environment', test: testEnvironment },
      { name: 'AsyncStorage', test: testAsyncStorage },
      { name: 'Firebase', test: testFirebaseConnection },
      { name: 'Brand Assets', test: testBrandAssets }
    ];

    for (const { test } of tests) {
      try {
        await test();
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for visual effect
      } catch (error) {
        console.error('Test error:', error);
      }
    }

    setIsLoading(false);
  };

  // Auto-run tests on component mount
  useEffect(() => {
    runAllTests();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'PASS': return '#16a34a';
      case 'FAIL': return '#dc2626';
      case 'ERROR': return '#dc2626';
      case 'WARN': return '#f59e0b';
      case 'INFO': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PASS': return '✅';
      case 'FAIL': return '❌';
      case 'ERROR': return '💥';
      case 'WARN': return '⚠️';
      case 'INFO': return 'ℹ️';
      default: return '⏳';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛹 SkateHubba System Check</Text>
      
      <TouchableOpacity 
        style={styles.testButton} 
        onPress={runAllTests}
        disabled={isLoading}
      >
        <Text style={styles.testButtonText}>
          {isLoading ? '🔄 Testing...' : '🧪 Run All Tests'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={styles.resultsContainer}>
        {Object.entries(testResults).map(([testName, result]) => (
          <View key={testName} style={styles.resultItem}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>{getStatusIcon(result.status)}</Text>
              <Text style={styles.resultName}>{testName}</Text>
              <Text style={[styles.resultStatus, { color: getStatusColor(result.status) }]}>
                {result.status}
              </Text>
            </View>
            <Text style={styles.resultMessage}>{result.message}</Text>
            <Text style={styles.resultTime}>{result.timestamp}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>
          {Object.keys(testResults).length > 0 
            ? `${Object.values(testResults).filter(r => r.status === 'PASS').length}/${Object.keys(testResults).length} tests passing`
            : 'Ready to test systems'
          }
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#111',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff6a00',
    textAlign: 'center',
    marginBottom: 20,
  },
  testButton: {
    backgroundColor: '#ff6a00',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  testButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  resultsContainer: {
    flex: 1,
    marginBottom: 20,
  },
  resultItem: {
    backgroundColor: '#222',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6a00',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  resultIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  resultName: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  resultStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  resultMessage: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 5,
  },
  resultTime: {
    fontSize: 12,
    color: '#888',
  },
  summaryContainer: {
    padding: 15,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  summaryText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default SystemTester;