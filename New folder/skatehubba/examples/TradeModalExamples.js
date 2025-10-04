// TradeModal Usage Examples
// This file demonstrates various ways to integrate and use the TradeModal component

import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import TradeModal from '../components/trade/TradeModal';

// Example 1: Basic Trade Modal Usage
export function BasicTradeExample() {
  const [showTradeModal, setShowTradeModal] = useState(false);

  const currentUser = {
    name: "You",
    avatar: "https://i.pravatar.cc/80?img=10",
    level: 12,
    hubbaBucks: 150,
    inventory: [
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
      }
    ]
  };

  const targetUser = {
    name: "FlipTayto",
    avatar: "https://i.pravatar.cc/80?img=17",
    level: 8,
    hubbaBucks: 89,
    inventory: [
      { 
        id: "muskaHigh", 
        name: "Muska Highs", 
        image: "https://via.placeholder.com/80x80/9B59B6/FFFFFF?text=SHOES", 
        serial: "11/100",
        rarity: "legendary",
        type: "shoes",
        stats: { grip: 90, durability: 92, style: 96 }
      }
    ]
  };

  const handleTradeConfirm = (tradeData) => {
    console.log('Trade confirmed:', tradeData);
    // Send to backend API
    // api.sendTradeProposal(tradeData);
    setShowTradeModal(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.tradeButton}
        onPress={() => setShowTradeModal(true)}
      >
        <Text style={styles.tradeButtonText}>Open Trade Modal</Text>
      </TouchableOpacity>

      <TradeModal
        visible={showTradeModal}
        yourUser={currentUser}
        theirUser={targetUser}
        onConfirm={handleTradeConfirm}
        onCancel={() => setShowTradeModal(false)}
      />
    </View>
  );
}

// Example 2: Trade from Profile Screen
export function ProfileTradeExample({ userProfile, currentUser }) {
  const [showTradeModal, setShowTradeModal] = useState(false);

  return (
    <>
      <TouchableOpacity 
        style={styles.profileTradeBtn}
        onPress={() => setShowTradeModal(true)}
      >
        <Text style={styles.profileTradeBtnText}>Trade Gear</Text>
      </TouchableOpacity>

      <TradeModal
        visible={showTradeModal}
        yourUser={currentUser}
        theirUser={userProfile}
        onConfirm={(tradeData) => {
          // Handle trade confirmation
          console.log('Profile trade:', tradeData);
          setShowTradeModal(false);
        }}
        onCancel={() => setShowTradeModal(false)}
      />
    </>
  );
}

// Example 3: Trade from Inventory Screen
export function InventoryTradeExample({ selectedItem, potentialTraders }) {
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState(null);

  const initiateTradeWithItem = (trader) => {
    setSelectedTrader(trader);
    setShowTradeModal(true);
  };

  return (
    <>
      {potentialTraders.map(trader => (
        <TouchableOpacity 
          key={trader.id}
          style={styles.traderButton}
          onPress={() => initiateTradeWithItem(trader)}
        >
          <Text>Trade with {trader.name}</Text>
        </TouchableOpacity>
      ))}

      <TradeModal
        visible={showTradeModal}
        yourUser={selectedTrader?.currentUser}
        theirUser={selectedTrader}
        onConfirm={(tradeData) => {
          // Handle inventory-specific trade
          console.log('Inventory trade:', tradeData);
          setShowTradeModal(false);
        }}
        onCancel={() => setShowTradeModal(false)}
      />
    </>
  );
}

// Example 4: Integration with Backend API
export class TradeService {
  static async sendTradeProposal(tradeData) {
    try {
      const response = await fetch('/api/trades/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          fromUserId: tradeData.fromUser.id,
          toUserId: tradeData.toUser.id,
          offeredItemId: tradeData.myItem.id,
          requestedItemId: tradeData.theirItem.id,
          tradeId: tradeData.tradeId,
          timestamp: tradeData.timestamp
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Show success notification
        showNotification('Trade proposal sent successfully!');
        return result;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Trade proposal failed:', error);
      showNotification('Failed to send trade proposal. Please try again.');
      throw error;
    }
  }

  static async getTradeableItems(userId) {
    try {
      const response = await fetch(`/api/users/${userId}/tradeable-items`);
      const items = await response.json();
      return items.filter(item => item.rarity !== 'common'); // Only rare+ items
    } catch (error) {
      console.error('Failed to fetch tradeable items:', error);
      return [];
    }
  }

  static async getUserTradeHistory(userId) {
    try {
      const response = await fetch(`/api/users/${userId}/trade-history`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch trade history:', error);
      return [];
    }
  }
}

// Example 5: Trade with Real-time Updates (WebSocket)
export function RealtimeTradeExample() {
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeStatus, setTradeStatus] = useState(null);

  useEffect(() => {
    // Set up WebSocket connection for real-time trade updates
    const ws = new WebSocket('wss://api.skatehubba.com/trades');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'TRADE_RECEIVED':
          // Show incoming trade notification
          showTradeNotification(data.trade);
          break;
        case 'TRADE_ACCEPTED':
          setTradeStatus('accepted');
          break;
        case 'TRADE_DECLINED':
          setTradeStatus('declined');
          break;
        case 'TRADE_CANCELLED':
          setTradeStatus('cancelled');
          break;
      }
    };

    return () => ws.close();
  }, []);

  return (
    <TradeModal
      visible={showTradeModal}
      onConfirm={(tradeData) => {
        // Send trade via WebSocket for real-time updates
        ws.send(JSON.stringify({
          type: 'PROPOSE_TRADE',
          data: tradeData
        }));
        setShowTradeModal(false);
      }}
      onCancel={() => setShowTradeModal(false)}
    />
  );
}

// Example 6: Trade Modal with Custom Validation
export function ValidatedTradeExample() {
  const [showTradeModal, setShowTradeModal] = useState(false);

  const validateTrade = (tradeData) => {
    const { myItem, theirItem } = tradeData;
    
    // Check rarity compatibility
    const rarityValues = {
      'common': 1,
      'rare': 2,
      'epic': 3,
      'legendary': 4
    };
    
    const myItemValue = rarityValues[myItem.rarity];
    const theirItemValue = rarityValues[theirItem.rarity];
    
    // Allow trades within 1 rarity level
    if (Math.abs(myItemValue - theirItemValue) > 1) {
      Alert.alert(
        'Unfair Trade',
        'This trade seems unfair. Consider trading items of similar rarity.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue Anyway', onPress: () => confirmTrade(tradeData) }
        ]
      );
      return false;
    }
    
    return true;
  };

  const handleTradeConfirm = (tradeData) => {
    if (validateTrade(tradeData)) {
      confirmTrade(tradeData);
    }
  };

  const confirmTrade = (tradeData) => {
    // Proceed with validated trade
    TradeService.sendTradeProposal(tradeData);
    setShowTradeModal(false);
  };

  return (
    <TradeModal
      visible={showTradeModal}
      onConfirm={handleTradeConfirm}
      onCancel={() => setShowTradeModal(false)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#181b1e',
  },
  tradeButton: {
    backgroundColor: '#FFD600',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  tradeButtonText: {
    color: '#181b1e',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileTradeBtn: {
    backgroundColor: '#23262b',
    borderWidth: 1,
    borderColor: '#FFD600',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  profileTradeBtnText: {
    color: '#FFD600',
    fontWeight: 'bold',
  },
  traderButton: {
    backgroundColor: '#FFD600',
    padding: 10,
    margin: 5,
    borderRadius: 5,
  },
});

export default {
  BasicTradeExample,
  ProfileTradeExample,
  InventoryTradeExample,
  TradeService,
  RealtimeTradeExample,
  ValidatedTradeExample
};
