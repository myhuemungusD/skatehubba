import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  SafeAreaView 
} from 'react-native';

// Import your beta services for testing
import { betaFeaturesAPI } from '../api/betaFeaturesApi';
import { shopService } from '../services/shopService';
import { currencyProgressionService } from '../services/currencyProgressionService';
import { avatarSystemService } from '../services/avatarSystemService';
import { collectibleTradingService } from '../services/collectibleTradingService';

const BetaTestRunner = () => {
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [userId] = useState('test-user-123'); // Mock user ID for testing

  const addTestResult = (testName, status, message) => {
    setTestResults(prev => [...prev, { 
      testName, 
      status, 
      message, 
      timestamp: new Date().toLocaleTimeString() 
    }]);
  };

  const runAllTests = async () => {
    setTesting(true);
    setTestResults([]);
    
    await runCurrencyTests();
    await runShopTests();
    await runAvatarTests();
    await runTradingTests();
    await runIntegrationTests();
    
    setTesting(false);
    Alert.alert('✅ Testing Complete', 'Check results below for detailed status');
  };

  const runCurrencyTests = async () => {
    addTestResult('Currency System', 'running', 'Testing currency awards...');
    
    try {
      // Test Hubba Bucks award
      const hbResult = await betaFeaturesAPI.awardCurrency(
        userId, 
        'hubba_bucks', 
        100, 
        'test_reward',
        { test: true }
      );
      
      if (hbResult.success) {
        addTestResult('Hubba Bucks Award', '✅', 'Successfully awarded 100 HB');
      } else {
        addTestResult('Hubba Bucks Award', '❌', `Failed: ${hbResult.error}`);
      }

      // Test XP award
      const xpResult = await betaFeaturesAPI.awardCurrency(
        userId, 
        'xp', 
        50, 
        'test_completion',
        { test: true }
      );
      
      if (xpResult.success) {
        addTestResult('XP Award', '✅', 'Successfully awarded 50 XP');
      } else {
        addTestResult('XP Award', '❌', `Failed: ${xpResult.error}`);
      }

    } catch (error) {
      addTestResult('Currency System', '❌', `Error: ${error.message}`);
    }
  };

  const runShopTests = async () => {
    addTestResult('Shop System', 'running', 'Testing shop functionality...');
    
    try {
      // Test getting shop inventory
      const inventory = await shopService.getShopInventory();
      
      if (inventory.standardGear && inventory.rareCollectibles) {
        addTestResult('Shop Inventory', '✅', `Loaded ${Object.keys(inventory.standardGear).length} standard + ${Object.keys(inventory.rareCollectibles).length} rare items`);
      } else {
        addTestResult('Shop Inventory', '❌', 'Failed to load shop inventory');
      }

      // Test purchase (with mock validation)
      const purchaseResult = await shopService.purchaseItem(
        userId, 
        'vulc_classics', 
        150,
        { test: true }
      );
      
      if (purchaseResult.success) {
        addTestResult('Item Purchase', '✅', 'Successfully purchased Vulc Classics');
      } else {
        addTestResult('Item Purchase', '❌', `Purchase failed: ${purchaseResult.error}`);
      }

    } catch (error) {
      addTestResult('Shop System', '❌', `Error: ${error.message}`);
    }
  };

  const runAvatarTests = async () => {
    addTestResult('Avatar System', 'running', 'Testing avatar functionality...');
    
    try {
      // Test avatar configuration
      const config = await avatarSystemService.getAvatarConfiguration(userId);
      
      if (config) {
        addTestResult('Avatar Config', '✅', 'Successfully loaded avatar configuration');
      } else {
        addTestResult('Avatar Config', '❌', 'Failed to load avatar configuration');
      }

      // Test stats calculation
      const stats = await avatarSystemService.calculateAvatarStats(userId);
      
      if (stats && typeof stats.style === 'number') {
        addTestResult('Stats Calculation', '✅', `Stats: Style ${stats.style}, Comfort ${stats.comfort}, Durability ${stats.durability}, Performance ${stats.performance}`);
      } else {
        addTestResult('Stats Calculation', '❌', 'Failed to calculate avatar stats');
      }

    } catch (error) {
      addTestResult('Avatar System', '❌', `Error: ${error.message}`);
    }
  };

  const runTradingTests = async () => {
    addTestResult('Trading System', 'running', 'Testing trading functionality...');
    
    try {
      // Test trade creation
      const tradeResult = await collectibleTradingService.createTrade(
        userId,
        ['test_item_1'],
        ['test_item_2'],
        'test-user-456',
        { test: true }
      );
      
      if (tradeResult.success) {
        addTestResult('Trade Creation', '✅', 'Successfully created test trade');
      } else {
        addTestResult('Trade Creation', '❌', `Trade creation failed: ${tradeResult.error}`);
      }

      // Test getting user trades
      const trades = await collectibleTradingService.getUserTrades(userId);
      
      if (Array.isArray(trades)) {
        addTestResult('Trade Retrieval', '✅', `Found ${trades.length} trades`);
      } else {
        addTestResult('Trade Retrieval', '❌', 'Failed to get user trades');
      }

    } catch (error) {
      addTestResult('Trading System', '❌', `Error: ${error.message}`);
    }
  };

  const runIntegrationTests = async () => {
    addTestResult('Integration Tests', 'running', 'Testing cross-system integration...');
    
    try {
      // Test dashboard data aggregation
      const dashboard = await betaFeaturesAPI.getUserDashboard(userId);
      
      if (dashboard.success && dashboard.dashboard) {
        addTestResult('Dashboard Integration', '✅', 'Successfully loaded integrated dashboard data');
      } else {
        addTestResult('Dashboard Integration', '❌', `Dashboard failed: ${dashboard.error}`);
      }

      // Test rate limiting
      addTestResult('Rate Limiting', 'running', 'Testing anti-cheat measures...');
      
      // This should eventually fail due to rate limits
      let rateLimitHit = false;
      for (let i = 0; i < 15; i++) {
        const result = await betaFeaturesAPI.awardCurrency(
          userId, 
          'hubba_bucks', 
          10, 
          'rate_limit_test',
          { test: true }
        );
        
        if (!result.success && result.error.includes('rate limit')) {
          rateLimitHit = true;
          break;
        }
      }
      
      if (rateLimitHit) {
        addTestResult('Rate Limiting', '✅', 'Rate limiting working correctly');
      } else {
        addTestResult('Rate Limiting', '⚠️', 'Rate limiting may not be active');
      }

    } catch (error) {
      addTestResult('Integration Tests', '❌', `Error: ${error.message}`);
    }
  };

  const runSingleTest = async (testType) => {
    setTesting(true);
    
    switch (testType) {
      case 'currency':
        await runCurrencyTests();
        break;
      case 'shop':
        await runShopTests();
        break;
      case 'avatar':
        await runAvatarTests();
        break;
      case 'trading':
        await runTradingTests();
        break;
      case 'integration':
        await runIntegrationTests();
        break;
    }
    
    setTesting(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const renderTestResult = (result, index) => (
    <View key={index} style={styles.testResult}>
      <View style={styles.testHeader}>
        <Text style={styles.testName}>{result.testName}</Text>
        <Text style={styles.testStatus}>{result.status}</Text>
        <Text style={styles.testTime}>{result.timestamp}</Text>
      </View>
      <Text style={styles.testMessage}>{result.message}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🧪 SkateHubba Beta Test Runner</Text>
          <Text style={styles.subtitle}>Validate all beta features</Text>
        </View>

        <View style={styles.buttonGrid}>
          <TouchableOpacity
            style={[styles.testButton, styles.allTestsButton]}
            onPress={runAllTests}
            disabled={testing}
          >
            <Text style={styles.buttonText}>
              {testing ? '🔄 Testing...' : '🚀 Run All Tests'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => runSingleTest('currency')}
            disabled={testing}
          >
            <Text style={styles.buttonText}>💰 Currency</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => runSingleTest('shop')}
            disabled={testing}
          >
            <Text style={styles.buttonText}>🛒 Shop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => runSingleTest('avatar')}
            disabled={testing}
          >
            <Text style={styles.buttonText}>👤 Avatar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => runSingleTest('trading')}
            disabled={testing}
          >
            <Text style={styles.buttonText}>🔄 Trading</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={() => runSingleTest('integration')}
            disabled={testing}
          >
            <Text style={styles.buttonText}>🔗 Integration</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.testButton, styles.clearButton]}
            onPress={clearResults}
          >
            <Text style={styles.buttonText}>🗑️ Clear</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>Test Results ({testResults.length})</Text>
          
          {testResults.length === 0 ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>
                Run tests to see results here
              </Text>
            </View>
          ) : (
            testResults.map(renderTestResult)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#3b82f6',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#bfdbfe',
    textAlign: 'center',
    marginTop: 4,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  testButton: {
    backgroundColor: '#059669',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    width: '48%',
    alignItems: 'center',
  },
  allTestsButton: {
    backgroundColor: '#dc2626',
    width: '100%',
    marginBottom: 16,
  },
  clearButton: {
    backgroundColor: '#6b7280',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  resultsSection: {
    paddingHorizontal: 16,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  noResults: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  noResultsText: {
    color: '#64748b',
    fontSize: 16,
  },
  testResult: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  testName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  testStatus: {
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 8,
  },
  testTime: {
    fontSize: 12,
    color: '#64748b',
  },
  testMessage: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
});

export default BetaTestRunner;
