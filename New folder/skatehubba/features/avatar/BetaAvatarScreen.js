import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  Modal,
  Image 
} from 'react-native';
import { betaFeaturesAPI } from '../api/betaFeaturesApi';
import { analyticsService, EventCategory } from '../services/analytics';

eas build:configure = ({ userId, navigation }) => {
  const [avatarData, setAvatarData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [availableItems, setAvailableItems] = useState([]);

  useEffect(() => {
    loadAvatarData();
  }, []);

  const loadAvatarData = async () => {
    try {
      setLoading(true);
      const response = await betaFeaturesAPI.getFullAvatarData(userId);
      
      if (response.success) {
        setAvatarData(response.avatar);
      } else {
        Alert.alert('Error', response.error || 'Failed to load avatar data');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to avatar system');
    } finally {
      setLoading(false);
    }
  };

  const openEquipModal = (slot) => {
    if (!avatarData?.inventory) return;
    
    // Filter items compatible with this slot
    const compatibleItems = [];
    
    Object.values(avatarData.inventory.inventory).forEach(categoryItems => {
      categoryItems.forEach(item => {
        if (isItemCompatibleWithSlot(item.category, slot)) {
          compatibleItems.push(item);
        }
      });
    });

    setSelectedSlot(slot);
    setAvailableItems(compatibleItems);
    setShowEquipModal(true);
  };

  const isItemCompatibleWithSlot = (category, slot) => {
    const compatibility = {
      shoes: ['feet'],
      decks: ['deck'],
      wheels: ['wheels'],
      trucks: ['trucks'],
      clothing: ['top', 'bottom', 'outerwear'],
      accessories: ['head', 'hands', 'misc'],
      stickers: ['deck_stickers']
    };

    return compatibility[category]?.includes(slot) || false;
  };

  const equipItem = async (item) => {
    try {
      const response = await betaFeaturesAPI.equipAvatarItem(userId, item.itemId, selectedSlot);
      
      if (response.success) {
        Alert.alert('Success!', `Equipped ${item.itemName} to ${selectedSlot}`);
        setShowEquipModal(false);
        loadAvatarData(); // Refresh avatar data
        
        analyticsService.logEvent('beta_avatar_item_equipped', {
          category: EventCategory.AVATAR,
          user_id: userId,
          item_id: item.itemId,
          slot: selectedSlot
        });
      } else {
        Alert.alert('Error', response.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to equip item');
    }
  };

  const unequipItem = async (slot) => {
    try {
      // Equip null to unequip
      const response = await betaFeaturesAPI.equipAvatarItem(userId, null, slot);
      
      if (response.success) {
        Alert.alert('Success!', `Unequipped item from ${slot}`);
        loadAvatarData();
      } else {
        Alert.alert('Error', response.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to unequip item');
    }
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

  const renderAvatarSlot = (slot, label) => {
    const equippedItem = avatarData?.configuration?.equipped?.[slot];
    
    return (
      <TouchableOpacity
        style={styles.slotContainer}
        onPress={() => openEquipModal(slot)}
        onLongPress={() => {
          if (equippedItem) {
            Alert.alert(
              'Unequip Item',
              `Remove ${equippedItem.name} from ${label}?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unequip', onPress: () => unequipItem(slot) }
              ]
            );
          }
        }}
      >
        <View style={styles.slotBox}>
          {equippedItem ? (
            <View style={styles.equippedItem}>
              <View style={[
                styles.rarityIndicator, 
                { backgroundColor: getRarityColor(equippedItem.rarity) }
              ]} />
              <Text style={styles.equippedItemName} numberOfLines={2}>
                {equippedItem.name}
              </Text>
              {equippedItem.serialNumber && (
                <Text style={styles.serialNumber}>
                  #{equippedItem.serialNumber}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.emptySlot}>
              <Text style={styles.emptySlotText}>Empty</Text>
            </View>
          )}
        </View>
        <Text style={styles.slotLabel}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderAvatarStats = () => {
    const stats = avatarData?.configuration?.stats || {};
    
    return (
      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>Avatar Stats</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Style</Text>
            <Text style={styles.statValue}>{stats.style || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Comfort</Text>
            <Text style={styles.statValue}>{stats.comfort || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Durability</Text>
            <Text style={styles.statValue}>{stats.durability || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Performance</Text>
            <Text style={styles.statValue}>{stats.performance || 0}</Text>
          </View>
        </View>
        {stats.rarity_bonus > 0 && (
          <Text style={styles.rarityBonus}>
            Rarity Bonus: +{stats.rarity_bonus}
          </Text>
        )}
      </View>
    );
  };

  const renderInventorySummary = () => {
    const stats = avatarData?.inventory?.stats || {};
    
    return (
      <View style={styles.inventoryContainer}>
        <Text style={styles.inventoryTitle}>Inventory Summary</Text>
        <View style={styles.inventoryStats}>
          <View style={styles.inventoryStat}>
            <Text style={styles.inventoryStatValue}>{stats.totalItems || 0}</Text>
            <Text style={styles.inventoryStatLabel}>Total Items</Text>
          </View>
          <View style={styles.inventoryStat}>
            <Text style={styles.inventoryStatValue}>{stats.rareItems || 0}</Text>
            <Text style={styles.inventoryStatLabel}>Rare Items</Text>
          </View>
          <View style={styles.inventoryStat}>
            <Text style={styles.inventoryStatValue}>{stats.totalValue || 0}</Text>
            <Text style={styles.inventoryStatLabel}>Total Value</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEquipModal = () => (
    <Modal
      visible={showEquipModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            Equip Item to {selectedSlot?.toUpperCase()}
          </Text>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setShowEquipModal(false)}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={availableItems}
          keyExtractor={(item) => `${item.itemId}-${item.serialNumber || 'standard'}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.modalItem}
              onPress={() => equipItem(item)}
            >
              <View style={styles.modalItemContent}>
                <View style={[
                  styles.modalItemRarity,
                  { backgroundColor: getRarityColor(item.rarity) }
                ]} />
                <View style={styles.modalItemInfo}>
                  <Text style={styles.modalItemName}>{item.itemName}</Text>
                  <Text style={styles.modalItemCategory}>{item.category}</Text>
                  {item.serialNumber && (
                    <Text style={styles.modalItemSerial}>#{item.serialNumber}</Text>
                  )}
                </View>
                <Text style={styles.modalItemPrice}>{item.price} HB</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyModalList}>
              <Text style={styles.emptyModalText}>
                No compatible items found for this slot
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Avatar...</Text>
      </View>
    );
  }

  if (!avatarData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load avatar data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAvatarData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[1]} // Dummy data for single item
        keyExtractor={() => 'avatar'}
        renderItem={() => (
          <View>
            {renderAvatarStats()}
            {renderInventorySummary()}
            
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarTitle}>Avatar Equipment</Text>
              
              <View style={styles.slotsGrid}>
                {renderAvatarSlot('feet', 'Shoes')}
                {renderAvatarSlot('deck', 'Deck')}
                {renderAvatarSlot('wheels', 'Wheels')}
                {renderAvatarSlot('trucks', 'Trucks')}
                {renderAvatarSlot('top', 'Top')}
                {renderAvatarSlot('bottom', 'Bottom')}
                {renderAvatarSlot('outerwear', 'Outerwear')}
                {renderAvatarSlot('head', 'Head')}
                {renderAvatarSlot('hands', 'Hands')}
                {renderAvatarSlot('misc', 'Misc')}
              </View>
              
              <Text style={styles.instructionText}>
                Tap to equip items, long press to unequip
              </Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContainer}
      />
      
      {renderEquipModal()}
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
  statsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
  },
  rarityBonus: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '600',
  },
  inventoryContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inventoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  inventoryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  inventoryStat: {
    alignItems: 'center',
  },
  inventoryStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  inventoryStatLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  avatarContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotContainer: {
    width: '48%',
    marginBottom: 12,
  },
  slotBox: {
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  equippedItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    position: 'relative',
  },
  rarityIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  equippedItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  serialNumber: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  emptySlot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySlotText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  slotLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  instructionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
    marginTop: 16,
    fontStyle: 'italic',
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
    color: '#3b82f6',
    fontWeight: '600',
  },
  modalItem: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  modalItemRarity: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  modalItemInfo: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  modalItemCategory: {
    fontSize: 12,
    color: '#64748b',
  },
  modalItemSerial: {
    fontSize: 10,
    color: '#94a3b8',
  },
  modalItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  emptyModalList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyModalText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
});

export default BetaAvatarScreen;
