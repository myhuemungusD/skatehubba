import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  Alert 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SkateHubba Shop Screen
 * Features: Skateboarding gear, community marketplace
 */

const ShopScreen = () => {
  const [coins, setCoins] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mock shop items
  const shopItems = [
    {
      id: 'board-001',
      name: 'Pro Street Deck',
      description: 'Professional 8.25" street skateboard deck with premium maple construction',
      price: 150,
      category: 'Decks',
      rarity: 'Epic',
      emoji: '🛹',
      inStock: true,
      level: 'Pro'
    },
    {
      id: 'wheels-001',
      name: 'Street Wheels Set',
      description: 'High-quality urethane wheels for street skating (52mm, 99A)',
      price: 75,
      category: 'Wheels',
      rarity: 'Rare',
      emoji: '⚪',
      inStock: true,
      level: 'Intermediate'
    },
    {
      id: 'trucks-001',
      name: 'Independent Trucks',
      description: 'Durable truck set for responsive turning and grinding',
      price: 120,
      category: 'Trucks',
      rarity: 'Epic',
      emoji: '⚙️',
      inStock: true,
      level: 'Pro'
    },
    {
      id: 'bearings-001',
      name: 'Swiss Bearings',
      description: 'Premium ABEC-7 bearings for smooth rolling',
      price: 40,
      category: 'Bearings',
      rarity: 'Common',
      emoji: '⚡',
      inStock: true,
      level: 'Beginner'
    },
    {
      id: 'shoes-001',
      name: 'Skate Shoes',
      description: 'Durable suede skate shoes with enhanced grip and board feel',
      price: 85,
      category: 'Footwear',
      rarity: 'Rare',
      emoji: '👟',
      inStock: false,
      level: 'Intermediate'
    }
  ];

  useEffect(() => {
    loadShopData();
  }, []);

  const loadShopData = async () => {
    try {
      // Load coins
      const savedCoins = await AsyncStorage.getItem('user_coins');
      setCoins(savedCoins ? parseInt(savedCoins) : 250); // Start with 250 coins

      // Load inventory
      const savedInventory = await AsyncStorage.getItem('user_inventory');
      setInventory(savedInventory ? JSON.parse(savedInventory) : []);

      setLoading(false);
    } catch (error) {
      console.error('Error loading shop data:', error);
      setLoading(false);
    }
  };

  const handlePurchase = async (item) => {
    if (coins < item.price) {
      Alert.alert(
        '💰 Insufficient Coins',
        `You need ${item.price - coins} more coins to purchase this item.`
      );
      return;
    }

    if (!item.inStock) {
      Alert.alert('📦 Out of Stock', 'This item is currently unavailable.');
      return;
    }

    // Check if already owned
    const alreadyOwned = inventory.some(owned => owned.id === item.id);
    if (alreadyOwned) {
      Alert.alert('✅ Already Owned', 'You already own this item!');
      return;
    }

    Alert.alert(
      '🛒 Confirm Purchase',
      `Purchase ${item.name} for ${item.price} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Buy Now', 
          style: 'default',
          onPress: async () => {
            try {
              // Deduct coins
              const newCoins = coins - item.price;
              await AsyncStorage.setItem('user_coins', newCoins.toString());
              setCoins(newCoins);

              // Add to inventory
              const purchasedItem = {
                ...item,
                purchaseDate: new Date().toISOString(),
                equipped: false
              };

              const newInventory = [...inventory, purchasedItem];
              await AsyncStorage.setItem('user_inventory', JSON.stringify(newInventory));
              setInventory(newInventory);

              Alert.alert(
                '🎉 Purchase Successful!',
                `${item.emoji} ${item.name} has been added to your inventory!`
              );

            } catch (error) {
              console.error('Purchase error:', error);
              Alert.alert('Error', 'Purchase failed. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'Common': return '#6b7280';
      case 'Rare': return '#3b82f6';
      case 'Epic': return '#8b5cf6';
      case 'Legendary': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>🛒 Loading Shop...</Text>
        <Text style={styles.loadingSubtext}>Stocking the latest gear</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛒 SkateHubba Shop</Text>
        <View style={styles.coinsContainer}>
          <Text style={styles.coinsText}>💰 {coins} coins</Text>
        </View>
      </View>

      {/* Shop Items */}
      <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
        {shopItems.map((item) => {
          const isOwned = inventory.some(owned => owned.id === item.id);
          
          return (
            <View key={item.id} style={[
              styles.itemCard,
              !item.inStock && styles.itemCardOutOfStock,
              isOwned && styles.itemCardOwned
            ]}>
              {/* Item Header */}
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleContainer}>
                  <Text style={styles.itemEmoji}>{item.emoji}</Text>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={[styles.itemRarity, { color: getRarityColor(item.rarity) }]}>
                      {item.rarity} • {item.level}
                    </Text>
                  </View>
                </View>
                <Text style={styles.itemPrice}>💰 {item.price}</Text>
              </View>

              {/* Item Description */}
              <Text style={styles.itemDescription}>{item.description}</Text>

              {/* Item Category & Status */}
              <View style={styles.itemDetails}>
                <Text style={styles.itemCategory}>
                  {item.category}
                </Text>
                <Text style={[
                  styles.itemStatus,
                  !item.inStock && styles.itemStatusOutOfStock,
                  isOwned && styles.itemStatusOwned
                ]}>
                  {isOwned ? '✅ Owned' : item.inStock ? '📦 In Stock' : '❌ Out of Stock'}
                </Text>
              </View>

              {/* Purchase Button */}
              <TouchableOpacity 
                style={[
                  styles.purchaseButton,
                  !item.inStock && styles.purchaseButtonDisabled,
                  isOwned && styles.purchaseButtonOwned,
                  coins < item.price && styles.purchaseButtonCantAfford
                ]}
                onPress={() => handlePurchase(item)}
                disabled={!item.inStock || isOwned}
              >
                <Text style={[
                  styles.purchaseButtonText,
                  !item.inStock && styles.purchaseButtonTextDisabled,
                  isOwned && styles.purchaseButtonTextOwned,
                  coins < item.price && styles.purchaseButtonTextCantAfford
                ]}>
                  {isOwned ? '✅ Owned' : 
                   !item.inStock ? '❌ Out of Stock' :
                   coins < item.price ? '💰 Need More Coins' :
                   `🛒 Buy for ${item.price} coins`}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* Inventory Button */}
      <TouchableOpacity style={styles.inventoryButton}>
        <Text style={styles.inventoryButtonText}>
          🎒 Inventory ({inventory.length})
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  loadingText: {
    color: '#ff6a00',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  loadingSubtext: {
    color: '#16a34a',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff6a00',
  },
  coinsContainer: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  coinsText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  itemsList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  itemCard: {
    backgroundColor: '#222',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6a00',
  },
  itemCardOutOfStock: {
    opacity: 0.6,
  },
  itemCardOwned: {
    borderLeftColor: '#16a34a',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  itemRarity: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemPrice: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemDescription: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemCategory: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '600',
  },
  itemStatus: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '600',
  },
  itemStatusOutOfStock: {
    color: '#dc2626',
  },
  itemStatusOwned: {
    color: '#16a34a',
  },
  purchaseButton: {
    backgroundColor: '#ff6a00',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  purchaseButtonDisabled: {
    backgroundColor: '#555',
  },
  purchaseButtonOwned: {
    backgroundColor: '#16a34a',
  },
  purchaseButtonCantAfford: {
    backgroundColor: '#dc2626',
  },
  purchaseButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  purchaseButtonTextDisabled: {
    color: '#999',
  },
  purchaseButtonTextOwned: {
    color: '#fff',
  },
  purchaseButtonTextCantAfford: {
    color: '#fff',
  },
  inventoryButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  inventoryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
});

export default ShopScreen;
