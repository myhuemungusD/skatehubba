import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  RefreshControl,
  Dimensions
} from 'react-native';
import { betaFeaturesAPI } from '../api/betaFeaturesApi';
import { analyticsService, EventCategory } from '../services/analytics';

const { width } = Dimensions.get('window');

const BetaDashboardScreen = ({ userId, navigation }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await betaFeaturesAPI.getUserDashboard(userId);
      
      if (response.success) {
        setDashboardData(response.dashboard);
      } else {
        Alert.alert('Error', response.error || 'Failed to load dashboard');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const navigateToFeature = (feature) => {
    analyticsService.logEvent('beta_feature_accessed', {
      category: EventCategory.NAVIGATION,
      user_id: userId,
      feature: feature
    });

    switch (feature) {
      case 'shop':
        navigation.navigate('BetaShop', { userId });
        break;
      case 'avatar':
        navigation.navigate('BetaAvatar', { userId });
        break;
      case 'trading':
        navigation.navigate('BetaTrading', { userId });
        break;
      default:
        Alert.alert('Coming Soon', `${feature} feature is in development`);
    }
  };

  const awardTestCurrency = async (type, amount) => {
    try {
      const response = await betaFeaturesAPI.awardCurrency(
        userId, 
        type, 
        amount, 
        type === 'hubba_bucks' ? 'quest_reward' : 'trick_completion',
        { test: true, feature: 'beta_dashboard' }
      );
      
      if (response.success) {
        Alert.alert('Success!', `Awarded ${amount} ${type}!`);
        loadDashboard(); // Refresh data
      } else {
        Alert.alert('Error', response.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to award currency');
    }
  };

  const renderProgressionCard = () => {
    const progression = dashboardData?.progression;
    if (!progression) return null;

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Progress</Text>
        
        <View style={styles.progressGrid}>
          <View style={styles.progressItem}>
            <Text style={styles.progressValue}>{progression.hubba_bucks}</Text>
            <Text style={styles.progressLabel}>Hubba Bucks</Text>
          </View>
          <View style={styles.progressItem}>
            <Text style={styles.progressValue}>{progression.level}</Text>
            <Text style={styles.progressLabel}>Level</Text>
          </View>
          <View style={styles.progressItem}>
            <Text style={styles.progressValue}>{progression.xp}</Text>
            <Text style={styles.progressLabel}>Total XP</Text>
          </View>
        </View>

        {progression.nextLevelProgress && (
          <View style={styles.levelProgress}>
            <Text style={styles.levelProgressText}>
              Next Level: {progression.xpToNextLevel} XP needed
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${progression.nextLevelProgress.percentage}%` }
                ]} 
              />
            </View>
          </View>
        )}

        <View style={styles.testButtons}>
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => awardTestCurrency('hubba_bucks', 100)}
          >
            <Text style={styles.testButtonText}>+100 HB</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => awardTestCurrency('xp', 50)}
          >
            <Text style={styles.testButtonText}>+50 XP</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAvatarCard = () => {
    const avatar = dashboardData?.avatar;
    if (!avatar) return null;

    const stats = avatar.configuration?.stats || {};
    const inventoryStats = avatar.inventory?.stats || {};

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigateToFeature('avatar')}
      >
        <Text style={styles.cardTitle}>Avatar & Gear</Text>
        
        <View style={styles.avatarGrid}>
          <View style={styles.avatarStat}>
            <Text style={styles.avatarStatValue}>{stats.style || 0}</Text>
            <Text style={styles.avatarStatLabel}>Style</Text>
          </View>
          <View style={styles.avatarStat}>
            <Text style={styles.avatarStatValue}>{inventoryStats.totalItems || 0}</Text>
            <Text style={styles.avatarStatLabel}>Items</Text>
          </View>
          <View style={styles.avatarStat}>
            <Text style={styles.avatarStatValue}>{inventoryStats.rareItems || 0}</Text>
            <Text style={styles.avatarStatLabel}>Rare</Text>
          </View>
          <View style={styles.avatarStat}>
            <Text style={styles.avatarStatValue}>{inventoryStats.totalValue || 0}</Text>
            <Text style={styles.avatarStatLabel}>Value</Text>
          </View>
        </View>

        <Text style={styles.cardFooter}>Tap to customize avatar →</Text>
      </TouchableOpacity>
    );
  };

  const renderShopCard = () => {
    const shop = dashboardData?.shop;
    if (!shop) return null;

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigateToFeature('shop')}
      >
        <Text style={styles.cardTitle}>Shop & Items</Text>
        
        <View style={styles.shopGrid}>
          <View style={styles.shopStat}>
            <Text style={styles.shopStatValue}>{shop.shop?.totalCount || 0}</Text>
            <Text style={styles.shopStatLabel}>Available Items</Text>
          </View>
          <View style={styles.shopStat}>
            <Text style={styles.shopStatValue}>{shop.purchaseHistory?.length || 0}</Text>
            <Text style={styles.shopStatLabel}>Purchases</Text>
          </View>
        </View>

        {shop.featured?.dailyDeal && (
          <View style={styles.dealContainer}>
            <Text style={styles.dealTitle}>Daily Deal</Text>
            <Text style={styles.dealItem}>{shop.featured.dailyDeal.name}</Text>
            <Text style={styles.dealPrice}>
              {shop.featured.dailyDeal.salePrice} HB 
              <Text style={styles.dealOriginalPrice}> ({shop.featured.dailyDeal.originalPrice} HB)</Text>
            </Text>
          </View>
        )}

        <Text style={styles.cardFooter}>Browse shop →</Text>
      </TouchableOpacity>
    );
  };

  const renderTradingCard = () => {
    const trades = dashboardData?.recent_trades || [];

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigateToFeature('trading')}
      >
        <Text style={styles.cardTitle}>Trading Center</Text>
        
        <View style={styles.tradingGrid}>
          <View style={styles.tradingStat}>
            <Text style={styles.tradingStatValue}>{trades.length}</Text>
            <Text style={styles.tradingStatLabel}>Recent Trades</Text>
          </View>
          <View style={styles.tradingStat}>
            <Text style={styles.tradingStatValue}>
              {trades.filter(t => t.status === 'pending').length}
            </Text>
            <Text style={styles.tradingStatLabel}>Pending</Text>
          </View>
          <View style={styles.tradingStat}>
            <Text style={styles.tradingStatValue}>
              {trades.filter(t => t.status === 'completed').length}
            </Text>
            <Text style={styles.tradingStatLabel}>Completed</Text>
          </View>
        </View>

        {trades.length > 0 && (
          <View style={styles.recentTradeContainer}>
            <Text style={styles.recentTradeTitle}>Latest Trade</Text>
            <Text style={styles.recentTradeItem}>
              {trades[0].offeringItems?.[0]?.name || 'Trade Offer'} - {trades[0].status}
            </Text>
          </View>
        )}

        <Text style={styles.cardFooter}>Manage trades →</Text>
      </TouchableOpacity>
    );
  };

  const renderFeatureButtons = () => (
    <View style={styles.featureGrid}>
      <TouchableOpacity 
        style={styles.featureButton}
        onPress={() => navigateToFeature('shop')}
      >
        <Text style={styles.featureButtonIcon}>🛒</Text>
        <Text style={styles.featureButtonText}>Shop</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.featureButton}
        onPress={() => navigateToFeature('avatar')}
      >
        <Text style={styles.featureButtonIcon}>👤</Text>
        <Text style={styles.featureButtonText}>Avatar</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.featureButton}
        onPress={() => navigateToFeature('trading')}
      >
        <Text style={styles.featureButtonIcon}>🔄</Text>
        <Text style={styles.featureButtonText}>Trading</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.featureButton}
        onPress={() => navigateToFeature('challenges')}
      >
        <Text style={styles.featureButtonIcon}>🏆</Text>
        <Text style={styles.featureButtonText}>Challenges</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBetaInfo = () => (
    <View style={styles.betaInfoCard}>
      <Text style={styles.betaInfoTitle}>🚀 Beta Features</Text>
      <Text style={styles.betaInfoText}>
        You're testing the latest SkateHubba features! All currency and trading is fully 
        functional with backend validation. Data is persistent and secure.
      </Text>
      <Text style={styles.betaInfoSubtext}>
        Features include: Shop with standard/rare gear, Hubba Bucks & XP progression, 
        Avatar system with equipment, and secure trading with fraud protection.
      </Text>
    </View>
  );

  if (loading && !dashboardData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Beta Dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>SkateHubba Beta</Text>
        <Text style={styles.subtitle}>Advanced Features Demo</Text>
      </View>

      {renderBetaInfo()}
      {renderProgressionCard()}
      {renderFeatureButtons()}
      {renderAvatarCard()}
      {renderShopCard()}
      {renderTradingCard()}
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Last updated: {dashboardData?.last_updated ? 
            new Date(dashboardData.last_updated).toLocaleTimeString() : 'Unknown'
          }
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#3b82f6',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: {
    fontSize: 28,
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
  betaInfoCard: {
    backgroundColor: '#fffbeb',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  betaInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 8,
  },
  betaInfoText: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 20,
    marginBottom: 8,
  },
  betaInfoSubtext: {
    fontSize: 12,
    color: '#a16207',
    lineHeight: 16,
  },
  card: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  cardFooter: {
    fontSize: 12,
    color: '#3b82f6',
    textAlign: 'right',
    marginTop: 8,
    fontWeight: '500',
  },
  progressGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  progressItem: {
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  progressLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  levelProgress: {
    marginBottom: 16,
  },
  levelProgressText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  testButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  testButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  testButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  featureButton: {
    width: (width - 48) / 2,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featureButtonIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  avatarGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  avatarStat: {
    alignItems: 'center',
  },
  avatarStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8b5cf6',
  },
  avatarStatLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  shopGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  shopStat: {
    alignItems: 'center',
  },
  shopStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
  },
  shopStatLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  dealContainer: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  dealTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  dealItem: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#78350f',
  },
  dealPrice: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  dealOriginalPrice: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  tradingGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  tradingStat: {
    alignItems: 'center',
  },
  tradingStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  tradingStatLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  recentTradeContainer: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  recentTradeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  recentTradeItem: {
    fontSize: 13,
    color: '#1e3a8a',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
  },
});

export default BetaDashboardScreen;
