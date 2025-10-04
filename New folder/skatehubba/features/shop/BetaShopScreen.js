import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { betaFeaturesAPI } from '../api/betaFeaturesApi';
import { getUserShopData, purchaseShopItem } from '../api/shopApi';
import { analyticsService, EventCategory } from '../services/analytics';

const BetaShopScreen = ({ userId, navigation }) => {
  const [shopData, setShopData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRarity, setSelectedRarity] = useState('all');

  useEffect(() => {
    loadShopData();
  }, []);

  const loadShopData = async () => {
    try {
      setLoading(true);
      const response = await getUserShopData(userId);
      
      if (response.success) {
        setShopData(response.data);
      } else {
        Alert.alert('Error', response.error || 'Failed to load shop data');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to shop');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadShopData();
    setRefreshing(false);
  };

  const handlePurchase = async (item) => {
    try {
      // Check if user has enough currency
      if (shopData.balances.hubba_bucks < item.price) {
        Alert.alert(
          'Insufficient Funds',
          `You need ${item.price} Hubba Bucks but only have ${shopData.balances.hubba_bucks}`
        );
        return;
      }

      // Confirm purchase
      Alert.alert(
        'Confirm Purchase',
        `Purchase ${item.name} for ${item.price} Hubba Bucks?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Buy Now', 
            onPress: async () => {
              const response = await purchaseShopItem(userId, item.id, 1, 'hubba_bucks');
              
              if (response.success) {
                Alert.alert('Success!', `You purchased ${item.name}!`);
                loadShopData(); // Refresh data
                
                analyticsService.logEvent('beta_shop_purchase_completed', {
                  category: EventCategory.SHOP,
                  user_id: userId,
                  item_id: item.id,
                  item_name: item.name,
                  price: item.price
                });
              } else {
                Alert.alert('Purchase Failed', response.error);
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Purchase failed. Please try again.');
    }
  };

  const getFilteredItems = () => {
    if (!shopData?.shop?.items) return [];
    
    return shopData.shop.items.filter(item => {
      const categoryMatch = selectedCategory === 'all' || item.category === selectedCategory;
      const rarityMatch = selectedRarity === 'all' || item.rarity === selectedRarity;
      return categoryMatch && rarityMatch;
    });
  };

  const getRarityColor = (rarity) => {
    const colors = {
      standard: '#94a3b8',
      rare: '#3b82f6',
      ultra_rare: '#8b5cf6',
      legendary: '#f59e0b',
      mythic: '#ef4444'
    };
    return colors[rarity] || colors.standard;
  };

  const renderShopItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={[styles.rarityBadge, { backgroundColor: getRarityColor(item.rarity) }]}>
          <Text style={styles.rarityText}>{item.rarity.toUpperCase()}</Text>
        </View>
      </View>
      
      <Text style={styles.itemDescription}>{item.description}</Text>
      
      <View style={styles.itemFooter}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceText}>{item.price} HB</Text>
          {item.availability === 'limited' && (
            <Text style={styles.stockText}>Stock: {item.remaining}/{item.stock}</Text>
          )}
        </View>
        
        <TouchableOpacity
          style={[
            styles.buyButton,
            shopData.balances.hubba_bucks < item.price && styles.buyButtonDisabled
          ]}
          onPress={() => handlePurchase(item)}
          disabled={shopData.balances.hubba_bucks < item.price}
        >
          <Text style={styles.buyButtonText}>
            {shopData.balances.hubba_bucks < item.price ? 'INSUFFICIENT FUNDS' : 'BUY NOW'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCategoryFilter = () => (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>Category:</Text>
      <FlatList
        horizontal
        data={['all', 'shoes', 'decks', 'wheels', 'trucks', 'clothing', 'accessories']}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedCategory === item && styles.filterButtonActive
            ]}
            onPress={() => setSelectedCategory(item)}
          >
            <Text style={[
              styles.filterButtonText,
              selectedCategory === item && styles.filterButtonTextActive
            ]}>
              {item.toUpperCase()}
            </Text>
          </TouchableOpacity>
        )}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );

  const renderRarityFilter = () => (
    <View style={styles.filterContainer}>
      <Text style={styles.filterLabel}>Rarity:</Text>
      <FlatList
        horizontal
        data={['all', 'standard', 'rare', 'ultra_rare', 'legendary']}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedRarity === item && styles.filterButtonActive
            ]}
            onPress={() => setSelectedRarity(item)}
          >
            <Text style={[
              styles.filterButtonText,
              selectedRarity === item && styles.filterButtonTextActive
            ]}>
              {item.replace('_', ' ').toUpperCase()}
            </Text>
          </TouchableOpacity>
        )}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );

  const renderBalanceHeader = () => (
    <View style={styles.balanceContainer}>
      <View style={styles.balanceItem}>
        <Text style={styles.balanceLabel}>Hubba Bucks</Text>
        <Text style={styles.balanceValue}>{shopData.balances.hubba_bucks}</Text>
      </View>
      <View style={styles.balanceItem}>
        <Text style={styles.balanceLabel}>Level</Text>
        <Text style={styles.balanceValue}>{shopData.balances.level}</Text>
      </View>
      <View style={styles.balanceItem}>
        <Text style={styles.balanceLabel}>XP</Text>
        <Text style={styles.balanceValue}>{shopData.balances.xp}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Shop...</Text>
      </View>
    );
  }

  if (!shopData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load shop data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadShopData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={getFilteredItems()}
        keyExtractor={(item) => item.id}
        renderItem={renderShopItem}
        ListHeaderComponent={() => (
          <View>
            {renderBalanceHeader()}
            {renderCategoryFilter()}
            {renderRarityFilter()}
            <Text style={styles.sectionTitle}>
              Shop Items ({getFilteredItems().length})
            </Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceItem: {
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  filterButton: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  rarityText: {
    fontSize: 10,
    color: 'white',
    fontWeight: 'bold',
  },
  itemDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flex: 1,
  },
  priceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  stockText: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 2,
  },
  buyButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buyButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buyButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default BetaShopScreen;
