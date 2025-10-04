import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  Modal,
  TextInput,
  Switch
} from 'react-native';
import { betaFeaturesAPI } from '../api/betaFeaturesApi';
import { analyticsService, EventCategory } from '../services/analytics';

const BetaTradingScreen = ({ userId, navigation }) => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userInventory, setUserInventory] = useState([]);
  const [tradeFilter, setTradeFilter] = useState('all');
  const [selectedOfferingItems, setSelectedOfferingItems] = useState([]);
  const [requestMessage, setRequestMessage] = useState('');
  const [isPublicTrade, setIsPublicTrade] = useState(false);

  useEffect(() => {
    loadTrades();
    loadUserInventory();
  }, []);

  const loadTrades = async () => {
    try {
      setLoading(true);
      const response = await betaFeaturesAPI.getUserTrades(userId, {
        status: tradeFilter === 'all' ? 'all' : tradeFilter,
        limit: 50
      });
      
      if (response.success) {
        setTrades(response.trades);
      } else {
        Alert.alert('Error', response.error || 'Failed to load trades');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to trading system');
    } finally {
      setLoading(false);
    }
  };

  const loadUserInventory = async () => {
    try {
      const response = await betaFeaturesAPI.getFullAvatarData(userId);
      if (response.success && response.avatar.inventory) {
        // Flatten inventory into single array
        const allItems = [];
        Object.values(response.avatar.inventory.inventory).forEach(categoryItems => {
          allItems.push(...categoryItems);
        });
        setUserInventory(allItems);
      }
    } catch (error) {
      console.error('Failed to load inventory for trading');
    }
  };

  const createTradeOffer = async () => {
    try {
      if (selectedOfferingItems.length === 0) {
        Alert.alert('Error', 'Please select at least one item to offer');
        return;
      }

      // For demo, we'll create a simple trade request
      const tradeData = {
        offeringItems: selectedOfferingItems.map(item => ({
          itemId: item.itemId,
          name: item.itemName,
          rarity: item.rarity,
          serialNumber: item.serialNumber
        })),
        requestingItems: [
          {
            itemId: 'any_rare_deck',
            name: 'Any Rare Deck',
            rarity: 'rare'
          }
        ],
        message: requestMessage || 'Looking for trade!',
        isPublic: isPublicTrade,
        targetUserId: null // Public trade
      };

      const response = await betaFeaturesAPI.createTradeOffer(userId, tradeData);
      
      if (response.success) {
        Alert.alert('Success!', 'Trade offer created successfully!');
        setShowCreateModal(false);
        setSelectedOfferingItems([]);
        setRequestMessage('');
        loadTrades();
        
        analyticsService.logEvent('beta_trade_offer_created', {
          category: EventCategory.TRADING,
          user_id: userId,
          offering_items_count: selectedOfferingItems.length,
          is_public: isPublicTrade
        });
      } else {
        Alert.alert('Error', response.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create trade offer');
    }
  };

  const acceptTrade = async (tradeId) => {
    try {
      Alert.alert(
        'Accept Trade',
        'Are you sure you want to accept this trade offer?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Accept', 
            onPress: async () => {
              const response = await betaFeaturesAPI.acceptTradeOffer(userId, tradeId);
              
              if (response.success) {
                Alert.alert('Success!', 'Trade completed successfully!');
                loadTrades();
                
                analyticsService.logEvent('beta_trade_accepted', {
                  category: EventCategory.TRADING,
                  user_id: userId,
                  trade_id: tradeId
                });
              } else {
                Alert.alert('Error', response.error);
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to accept trade');
    }
  };

  const getTradeStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      completed: '#059669',
      cancelled: '#64748b',
      expired: '#ef4444'
    };
    return colors[status] || colors.pending;
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

  const renderTradeItem = ({ item: trade }) => (
    <View style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <Text style={styles.tradeId}>Trade #{trade.id?.slice(-8)}</Text>
        <View style={[
          styles.statusBadge, 
          { backgroundColor: getTradeStatusColor(trade.status) }
        ]}>
          <Text style={styles.statusText}>{trade.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.tradeContent}>
        <View style={styles.tradeSection}>
          <Text style={styles.sectionTitle}>Offering:</Text>
          {trade.offeringItems?.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={[
                styles.rarityDot,
                { backgroundColor: getRarityColor(item.rarity) }
              ]} />
              <Text style={styles.itemName}>{item.name}</Text>
              {item.serialNumber && (
                <Text style={styles.serialText}>#{item.serialNumber}</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.tradeSection}>
          <Text style={styles.sectionTitle}>Requesting:</Text>
          {trade.requestingItems?.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={[
                styles.rarityDot,
                { backgroundColor: getRarityColor(item.rarity) }
              ]} />
              <Text style={styles.itemName}>{item.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {trade.message && (
        <Text style={styles.tradeMessage}>"{trade.message}"</Text>
      )}

      <View style={styles.tradeFooter}>
        <Text style={styles.tradeDate}>
          {new Date(trade.createdAt).toLocaleDateString()}
        </Text>
        
        {trade.status === 'pending' && trade.type === 'received' && (
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => acceptTrade(trade.id)}
          >
            <Text style={styles.acceptButtonText}>Accept Trade</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderInventoryItem = ({ item }) => {
    const isSelected = selectedOfferingItems.some(selected => 
      selected.itemId === item.itemId && selected.serialNumber === item.serialNumber
    );

    return (
      <TouchableOpacity
        style={[
          styles.inventoryItem,
          isSelected && styles.inventoryItemSelected
        ]}
        onPress={() => {
          if (isSelected) {
            setSelectedOfferingItems(prev => 
              prev.filter(selected => 
                !(selected.itemId === item.itemId && selected.serialNumber === item.serialNumber)
              )
            );
          } else {
            setSelectedOfferingItems(prev => [...prev, item]);
          }
        }}
      >
        <View style={[
          styles.rarityDot,
          { backgroundColor: getRarityColor(item.rarity) }
        ]} />
        <View style={styles.inventoryItemInfo}>
          <Text style={styles.inventoryItemName}>{item.itemName}</Text>
          <Text style={styles.inventoryItemCategory}>{item.category}</Text>
          {item.serialNumber && (
            <Text style={styles.inventoryItemSerial}>#{item.serialNumber}</Text>
          )}
        </View>
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Text style={styles.selectedText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderCreateTradeModal = () => (
    <Modal
      visible={showCreateModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create Trade Offer</Text>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setShowCreateModal(false)}
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <Text style={styles.modalSectionTitle}>
            Select Items to Offer ({selectedOfferingItems.length})
          </Text>
          
          <FlatList
            data={userInventory}
            keyExtractor={(item) => `${item.itemId}-${item.serialNumber || 'standard'}`}
            renderItem={renderInventoryItem}
            style={styles.inventoryList}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No items available for trading</Text>
            }
          />

          <View style={styles.tradeOptionsContainer}>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Public Trade</Text>
              <Switch
                value={isPublicTrade}
                onValueChange={setIsPublicTrade}
                trackColor={{ false: '#e2e8f0', true: '#3b82f6' }}
                thumbColor={isPublicTrade ? '#ffffff' : '#ffffff'}
              />
            </View>

            <TextInput
              style={styles.messageInput}
              placeholder="Trade message (optional)"
              value={requestMessage}
              onChangeText={setRequestMessage}
              multiline
              maxLength={200}
            />

            <TouchableOpacity
              style={[
                styles.createTradeButton,
                selectedOfferingItems.length === 0 && styles.createTradeButtonDisabled
              ]}
              onPress={createTradeOffer}
              disabled={selectedOfferingItems.length === 0}
            >
              <Text style={styles.createTradeButtonText}>
                Create Trade Offer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderFilterButtons = () => (
    <View style={styles.filterContainer}>
      {['all', 'pending', 'completed', 'sent', 'received'].map(filter => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.filterButton,
            tradeFilter === filter && styles.filterButtonActive
          ]}
          onPress={() => {
            setTradeFilter(filter);
            loadTrades();
          }}
        >
          <Text style={[
            styles.filterButtonText,
            tradeFilter === filter && styles.filterButtonTextActive
          ]}>
            {filter.toUpperCase()}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Trades...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trading Center</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+ Create Trade</Text>
        </TouchableOpacity>
      </View>

      {renderFilterButtons()}

      <FlatList
        data={trades}
        keyExtractor={(item) => item.id}
        renderItem={renderTradeItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No trades found</Text>
            <Text style={styles.emptySubtext}>
              Create your first trade offer to get started!
            </Text>
          </View>
        }
        refreshing={loading}
        onRefresh={loadTrades}
      />

      {renderCreateTradeModal()}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  createButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#f1f5f9',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  listContainer: {
    padding: 16,
  },
  tradeCard: {
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
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tradeId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    color: 'white',
    fontWeight: 'bold',
  },
  tradeContent: {
    marginBottom: 12,
  },
  tradeSection: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  rarityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  itemName: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  serialText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  tradeMessage: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  tradeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tradeDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  acceptButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  acceptButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  inventoryList: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 16,
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  inventoryItemSelected: {
    backgroundColor: '#eff6ff',
  },
  inventoryItemInfo: {
    flex: 1,
    marginLeft: 8,
  },
  inventoryItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  inventoryItemCategory: {
    fontSize: 12,
    color: '#64748b',
  },
  inventoryItemSerial: {
    fontSize: 10,
    color: '#9ca3af',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tradeOptionsContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  createTradeButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createTradeButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  createTradeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default BetaTradingScreen;
