import React, { useState, useEffect } from "react";
import { 
  Modal, 
  View, 
  Text, 
  Image, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  Alert,
  Dimensions,
  ScrollView
} from "react-native";
import { FontAwesome5, MaterialIcons } from "@expo/vector-icons";

const { width } = Dimensions.get('window');

// Enhanced mock gear data with rarity and stats
const yourGear = [
  { 
    id: "osirisD3", 
    name: "Osiris D3", 
    image: "https://via.placeholder.com/80x80/FF6B6B/FFFFFF?text=SHOES", 
    serial: "27/100",
    rarity: "legendary",
    type: "shoes",
    stats: { grip: 95, durability: 88, style: 92 }
  },
  { 
    id: "bakerDeck", 
    name: "Baker OG Deck", 
    image: "https://via.placeholder.com/80x80/FFD600/181b1e?text=DECK", 
    serial: "4/100",
    rarity: "legendary",
    type: "deck",
    stats: { pop: 98, stability: 90, weight: 85 }
  },
  { 
    id: "thrasheTee", 
    name: "Thrasher Vintage Tee", 
    image: "https://via.placeholder.com/80x80/4ECDC4/FFFFFF?text=SHIRT", 
    serial: "45/200",
    rarity: "rare",
    type: "clothing",
    stats: { comfort: 85, style: 90, durability: 75 }
  },
  { 
    id: "spitfireWheels", 
    name: "Spitfire Formula Four", 
    image: "https://via.placeholder.com/80x80/45B7D1/FFFFFF?text=WHEELS", 
    serial: "89/150",
    rarity: "epic",
    type: "wheels",
    stats: { speed: 92, grip: 88, durability: 95 }
  }
];

const theirGear = [
  { 
    id: "muskaHigh", 
    name: "Muska Highs", 
    image: "https://via.placeholder.com/80x80/9B59B6/FFFFFF?text=SHOES", 
    serial: "11/100",
    rarity: "legendary",
    type: "shoes",
    stats: { grip: 90, durability: 92, style: 96 }
  },
  { 
    id: "shortysTee", 
    name: "Shorty's OG Tee", 
    image: "https://via.placeholder.com/80x80/E74C3C/FFFFFF?text=SHIRT", 
    serial: "17/50",
    rarity: "legendary",
    type: "clothing",
    stats: { comfort: 88, style: 95, durability: 80 }
  },
  { 
    id: "elementDeck", 
    name: "Element Nature Deck", 
    image: "https://via.placeholder.com/80x80/2ECC71/FFFFFF?text=DECK", 
    serial: "33/75",
    rarity: "epic",
    type: "deck",
    stats: { pop: 85, stability: 88, weight: 90 }
  }
];

export default function TradeModal({
  visible,
  yourUser = { 
    name: "You", 
    avatar: "https://i.pravatar.cc/80?img=10", 
    inventory: yourGear,
    level: 12,
    hubbaBucks: 150
  },
  theirUser = { 
    name: "FlipTayto", 
    avatar: "https://i.pravatar.cc/80?img=17", 
    inventory: theirGear,
    level: 8,
    hubbaBucks: 89
  },
  onConfirm,
  onCancel
}) {
  const [selectedMine, setSelectedMine] = useState(null);
  const [selectedTheirs, setSelectedTheirs] = useState(null);
  const [showItemDetails, setShowItemDetails] = useState(null);
  const [tradeStep, setTradeStep] = useState('select'); // 'select', 'confirm', 'processing'

  const canTrade = selectedMine && selectedTheirs;

  useEffect(() => {
    if (visible) {
      setSelectedMine(null);
      setSelectedTheirs(null);
      setTradeStep('select');
      setShowItemDetails(null);
    }
  }, [visible]);

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case "legendary": return "#FFD700";
      case "epic": return "#9B59B6";
      case "rare": return "#3498DB";
      case "common": return "#95A5A6";
      default: return "#95A5A6";
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "deck": return "skateboarding";
      case "shoes": return "running";
      case "clothing": return "tshirt";
      case "wheels": return "circle";
      case "trucks": return "wrench";
      default: return "cube";
    }
  };

  const handleItemPress = (item, isMine) => {
    if (isMine) {
      setSelectedMine(selectedMine?.id === item.id ? null : item);
    } else {
      setSelectedTheirs(selectedTheirs?.id === item.id ? null : item);
    }
  };

  const handleItemLongPress = (item) => {
    setShowItemDetails(item);
  };

  const handleConfirmTrade = () => {
    if (!canTrade) return;
    
    setTradeStep('confirm');
  };

  const handleFinalConfirm = () => {
    setTradeStep('processing');
    
    // Simulate trade processing
    setTimeout(() => {
      onConfirm?.({ 
        myItem: selectedMine, 
        theirItem: selectedTheirs,
        tradeId: `trade_${Date.now()}`,
        timestamp: new Date().toISOString()
      });
      Alert.alert(
        "Trade Sent!",
        `Your trade proposal has been sent to ${theirUser.name}. They'll receive a notification to review your offer.`,
        [{ text: "OK", onPress: onCancel }]
      );
    }, 2000);
  };

  const renderGearItem = ({ item, isMine }) => {
    const isSelected = isMine ? 
      selectedMine?.id === item.id : 
      selectedTheirs?.id === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.gearItem,
          isSelected && styles.selectedItem,
          { borderColor: getRarityColor(item.rarity) }
        ]}
        onPress={() => handleItemPress(item, isMine)}
        onLongPress={() => handleItemLongPress(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.rarityBorder, { borderColor: getRarityColor(item.rarity) }]}>
          <Image source={{ uri: item.image }} style={styles.gearImg} />
          <View style={[styles.rarityDot, { backgroundColor: getRarityColor(item.rarity) }]} />
          <FontAwesome5 
            name={getTypeIcon(item.type)} 
            size={12} 
            color="#FFF" 
            style={styles.typeIcon}
          />
        </View>
        <Text style={styles.gearName} numberOfLines={2}>{item.name}</Text>
        <Text style={[styles.serial, { color: getRarityColor(item.rarity) }]}>
          #{item.serial}
        </Text>
        <Text style={[styles.rarity, { color: getRarityColor(item.rarity) }]}>
          {item.rarity.toUpperCase()}
        </Text>
        {isSelected && (
          <View style={styles.selectedOverlay}>
            <FontAwesome5 name="check" size={16} color="#FFD600" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderItemDetails = () => {
    if (!showItemDetails) return null;

    return (
      <Modal
        visible={true}
        transparent
        animationType="fade"
        onRequestClose={() => setShowItemDetails(null)}
      >
        <View style={styles.detailsOverlay}>
          <View style={styles.detailsModal}>
            <View style={styles.detailsHeader}>
              <Text style={styles.detailsTitle}>{showItemDetails.name}</Text>
              <TouchableOpacity 
                onPress={() => setShowItemDetails(null)}
                style={styles.closeButton}
              >
                <FontAwesome5 name="times" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.detailsContent}>
              <Image source={{ uri: showItemDetails.image }} style={styles.detailsImage} />
              
              <View style={styles.detailsInfo}>
                <Text style={[styles.detailsRarity, { color: getRarityColor(showItemDetails.rarity) }]}>
                  {showItemDetails.rarity.toUpperCase()}
                </Text>
                <Text style={styles.detailsSerial}>#{showItemDetails.serial}</Text>
                
                <View style={styles.statsContainer}>
                  <Text style={styles.statsTitle}>Stats:</Text>
                  {Object.entries(showItemDetails.stats).map(([stat, value]) => (
                    <View key={stat} style={styles.statRow}>
                      <Text style={styles.statName}>{stat.charAt(0).toUpperCase() + stat.slice(1)}</Text>
                      <View style={styles.statBar}>
                        <View style={[styles.statFill, { width: `${value}%` }]} />
                      </View>
                      <Text style={styles.statValue}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderSelectStep = () => (
    <>
      <Text style={styles.title}>
        <FontAwesome5 name="exchange-alt" size={20} color="#FFD600" />
        {" "}Propose a Trade
      </Text>
      
      {/* User Headers */}
      <View style={styles.usersHeader}>
        <View style={styles.userHeaderBox}>
          <Image source={{ uri: yourUser.avatar }} style={styles.headerAvatar} />
          <Text style={styles.userHeaderName}>{yourUser.name}</Text>
          <Text style={styles.userLevel}>Level {yourUser.level}</Text>
        </View>
        
        <View style={styles.tradeArrow}>
          <FontAwesome5 name="exchange-alt" size={24} color="#FFD600" />
        </View>
        
        <View style={styles.userHeaderBox}>
          <Image source={{ uri: theirUser.avatar }} style={styles.headerAvatar} />
          <Text style={styles.userHeaderName}>{theirUser.name}</Text>
          <Text style={styles.userLevel}>Level {theirUser.level}</Text>
        </View>
      </View>

      {/* Inventories */}
      <ScrollView style={styles.inventoriesContainer} showsVerticalScrollIndicator={false}>
        {/* Your Inventory */}
        <View style={styles.inventorySection}>
          <Text style={styles.inventoryTitle}>
            <FontAwesome5 name="backpack" size={16} color="#FFD600" />
            {" "}Your Tradeable Items
          </Text>
          <FlatList
            data={yourUser.inventory}
            keyExtractor={item => item.id}
            horizontal
            renderItem={({ item }) => renderGearItem({ item, isMine: true })}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gearList}
          />
        </View>

        {/* Their Inventory */}
        <View style={styles.inventorySection}>
          <Text style={styles.inventoryTitle}>
            <FontAwesome5 name="backpack" size={16} color="#FFD600" />
            {" "}{theirUser.name}'s Items
          </Text>
          <FlatList
            data={theirUser.inventory}
            keyExtractor={item => item.id}
            horizontal
            renderItem={({ item }) => renderGearItem({ item, isMine: false })}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gearList}
          />
        </View>
      </ScrollView>

      {/* Selection Summary */}
      <View style={styles.selectionSummary}>
        <View style={styles.selectedItemBox}>
          <Text style={styles.selectedLabel}>You Offer:</Text>
          {selectedMine ? (
            <View style={styles.selectedItemContent}>
              <Image source={{ uri: selectedMine.image }} style={styles.selectedItemImage} />
              <Text style={styles.selectedItemName}>{selectedMine.name}</Text>
              <Text style={[styles.selectedItemSerial, { color: getRarityColor(selectedMine.rarity) }]}>
                #{selectedMine.serial}
              </Text>
            </View>
          ) : (
            <Text style={styles.noSelection}>Select an item</Text>
          )}
        </View>

        <FontAwesome5 name="arrow-right" size={20} color="#FFD600" style={styles.arrowIcon} />

        <View style={styles.selectedItemBox}>
          <Text style={styles.selectedLabel}>You Want:</Text>
          {selectedTheirs ? (
            <View style={styles.selectedItemContent}>
              <Image source={{ uri: selectedTheirs.image }} style={styles.selectedItemImage} />
              <Text style={styles.selectedItemName}>{selectedTheirs.name}</Text>
              <Text style={[styles.selectedItemSerial, { color: getRarityColor(selectedTheirs.rarity) }]}>
                #{selectedTheirs.serial}
              </Text>
            </View>
          ) : (
            <Text style={styles.noSelection}>Select an item</Text>
          )}
        </View>
      </View>

      {/* Tip */}
      <Text style={styles.tip}>
        <FontAwesome5 name="info-circle" size={12} color="#666" />
        {" "}Long press items to view detailed stats
      </Text>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <Text style={styles.title}>
        <FontAwesome5 name="check-circle" size={20} color="#FFD600" />
        {" "}Confirm Trade
      </Text>
      
      <View style={styles.confirmContainer}>
        <Text style={styles.confirmText}>You are about to propose this trade:</Text>
        
        <View style={styles.tradePreview}>
          <View style={styles.tradePreviewItem}>
            <Text style={styles.tradePreviewLabel}>You Give:</Text>
            <Image source={{ uri: selectedMine.image }} style={styles.tradePreviewImage} />
            <Text style={styles.tradePreviewName}>{selectedMine.name}</Text>
            <Text style={[styles.tradePreviewSerial, { color: getRarityColor(selectedMine.rarity) }]}>
              #{selectedMine.serial}
            </Text>
            <Text style={[styles.tradePreviewRarity, { color: getRarityColor(selectedMine.rarity) }]}>
              {selectedMine.rarity.toUpperCase()}
            </Text>
          </View>
          
          <FontAwesome5 name="exchange-alt" size={30} color="#FFD600" style={styles.tradePreviewArrow} />
          
          <View style={styles.tradePreviewItem}>
            <Text style={styles.tradePreviewLabel}>You Get:</Text>
            <Image source={{ uri: selectedTheirs.image }} style={styles.tradePreviewImage} />
            <Text style={styles.tradePreviewName}>{selectedTheirs.name}</Text>
            <Text style={[styles.tradePreviewSerial, { color: getRarityColor(selectedTheirs.rarity) }]}>
              #{selectedTheirs.serial}
            </Text>
            <Text style={[styles.tradePreviewRarity, { color: getRarityColor(selectedTheirs.rarity) }]}>
              {selectedTheirs.rarity.toUpperCase()}
            </Text>
          </View>
        </View>
        
        <Text style={styles.confirmWarning}>
          <FontAwesome5 name="exclamation-triangle" size={14} color="#FF6B6B" />
          {" "}This action cannot be undone once {theirUser.name} accepts the trade.
        </Text>
      </View>
    </>
  );

  const renderProcessingStep = () => (
    <View style={styles.processingContainer}>
      <FontAwesome5 name="paper-plane" size={40} color="#FFD600" />
      <Text style={styles.processingTitle}>Sending Trade Proposal...</Text>
      <Text style={styles.processingText}>
        Your trade offer is being sent to {theirUser.name}
      </Text>
    </View>
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.modal}>
            {tradeStep === 'select' && renderSelectStep()}
            {tradeStep === 'confirm' && renderConfirmStep()}
            {tradeStep === 'processing' && renderProcessingStep()}
            
            {/* Action Buttons */}
            {tradeStep !== 'processing' && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                  <FontAwesome5 name="times" size={16} color="#FFD600" />
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                
                {tradeStep === 'select' ? (
                  <TouchableOpacity
                    style={[styles.confirmBtn, !canTrade && styles.disabledBtn]}
                    onPress={handleConfirmTrade}
                    disabled={!canTrade}
                  >
                    <FontAwesome5 name="arrow-right" size={16} color="#181b1e" />
                    <Text style={styles.confirmText}>Review Trade</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={handleFinalConfirm}
                  >
                    <FontAwesome5 name="paper-plane" size={16} color="#181b1e" />
                    <Text style={styles.confirmText}>Send Trade</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
      
      {renderItemDetails()}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: "rgba(20,22,25,0.95)", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  modal: { 
    backgroundColor: "#23262b", 
    borderRadius: 20, 
    width: width * 0.95, 
    maxWidth: 400,
    maxHeight: '90%',
    padding: 20,
  },
  title: { 
    fontSize: 22, 
    color: "#FFD600", 
    fontWeight: "bold", 
    marginBottom: 20,
    textAlign: "center"
  },
  
  // User headers
  usersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  userHeaderBox: {
    alignItems: "center",
    flex: 1,
  },
  headerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#bbb",
    marginBottom: 8,
  },
  userHeaderName: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 2,
  },
  userLevel: {
    color: "#FFD600",
    fontSize: 12,
  },
  tradeArrow: {
    marginHorizontal: 20,
  },
  
  // Inventories
  inventoriesContainer: {
    maxHeight: 300,
  },
  inventorySection: {
    marginBottom: 20,
  },
  inventoryTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  gearList: {
    paddingVertical: 5,
  },
  
  // Gear items
  gearItem: {
    alignItems: "center",
    marginRight: 15,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    width: 90,
    position: "relative",
  },
  selectedItem: {
    backgroundColor: "#2a2d33",
  },
  rarityBorder: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 4,
    position: "relative",
    marginBottom: 8,
  },
  gearImg: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  rarityDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#23262b",
  },
  typeIcon: {
    position: "absolute",
    bottom: -2,
    left: -2,
    backgroundColor: "#23262b",
    borderRadius: 8,
    padding: 2,
  },
  gearName: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 2,
    lineHeight: 14,
  },
  serial: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 2,
  },
  rarity: {
    fontSize: 9,
    fontWeight: "bold",
  },
  selectedOverlay: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "#23262b",
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: "#FFD600",
  },
  
  // Selection summary
  selectionSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1d22",
    borderRadius: 12,
    padding: 15,
    marginVertical: 15,
  },
  selectedItemBox: {
    alignItems: "center",
    flex: 1,
  },
  selectedLabel: {
    color: "#FFD600",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
  },
  selectedItemContent: {
    alignItems: "center",
  },
  selectedItemImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginBottom: 4,
  },
  selectedItemName: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 2,
  },
  selectedItemSerial: {
    fontSize: 10,
    fontWeight: "bold",
  },
  noSelection: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
  },
  arrowIcon: {
    marginHorizontal: 15,
  },
  
  tip: {
    color: "#666",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 10,
  },
  
  // Confirm step
  confirmContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  confirmText: {
    color: "#FFF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  tradePreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1d22",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    width: "100%",
  },
  tradePreviewItem: {
    alignItems: "center",
    flex: 1,
  },
  tradePreviewLabel: {
    color: "#FFD600",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
  },
  tradePreviewImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginBottom: 8,
  },
  tradePreviewName: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  tradePreviewSerial: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 2,
  },
  tradePreviewRarity: {
    fontSize: 10,
    fontWeight: "bold",
  },
  tradePreviewArrow: {
    marginHorizontal: 20,
  },
  confirmWarning: {
    color: "#FF6B6B",
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  
  // Processing step
  processingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  processingTitle: {
    color: "#FFD600",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
  },
  processingText: {
    color: "#FFF",
    fontSize: 14,
    textAlign: "center",
  },
  
  // Action buttons
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 15,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#1a1d22",
    borderWidth: 1,
    borderColor: "#FFD600",
    flex: 1,
    justifyContent: "center",
  },
  cancelText: {
    color: "#FFD600",
    fontWeight: "bold",
    marginLeft: 8,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFD600",
    padding: 12,
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
  },
  disabledBtn: {
    backgroundColor: "#666",
    opacity: 0.5,
  },
  confirmText: {
    color: "#181b1e",
    fontWeight: "bold",
    marginLeft: 8,
  },
  
  // Item details modal
  detailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  detailsModal: {
    backgroundColor: "#23262b",
    borderRadius: 16,
    width: width * 0.85,
    maxWidth: 350,
    padding: 20,
  },
  detailsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  detailsTitle: {
    color: "#FFD600",
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  detailsContent: {
    alignItems: "center",
  },
  detailsImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginBottom: 15,
  },
  detailsInfo: {
    alignItems: "center",
    width: "100%",
  },
  detailsRarity: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  detailsSerial: {
    color: "#FFD600",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 20,
  },
  statsContainer: {
    width: "100%",
  },
  statsTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statName: {
    color: "#FFF",
    fontSize: 14,
    width: 80,
    textTransform: "capitalize",
  },
  statBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#1a1d22",
    borderRadius: 4,
    marginHorizontal: 10,
  },
  statFill: {
    height: "100%",
    backgroundColor: "#FFD600",
    borderRadius: 4,
  },
  statValue: {
    color: "#FFD600",
    fontSize: 14,
    fontWeight: "bold",
    width: 30,
    textAlign: "right",
  },
});
