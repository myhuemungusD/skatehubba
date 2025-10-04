import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  runTransaction,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class CollectibleTradingService {
  constructor() {
    this.activeTradeWatchers = new Map();
    this.chatSubscriptions = new Map();
    this.negotiationTimers = new Map();
  }

  // TRADE CREATION & MANAGEMENT

  async createTradeOffer(traderUserId, tradeData) {
    try {
      const { 
        offeringItems, 
        requestingItems, 
        targetUserId, 
        message, 
        isPublic = false,
        expiresIn = 7 * 24 * 60 * 60 * 1000 // 7 days default
      } = tradeData;

      // Validate ownership of offered items
      for (const item of offeringItems) {
        const isOwner = await this.verifyItemOwnership(traderUserId, item.itemId, item.serialNumber);
        if (!isOwner) {
          throw new Error(`You don't own ${item.name} #${item.serialNumber}`);
        }
      }

      // Calculate trade values
      const offerValue = await this.calculateTradeValue(offeringItems);
      const requestValue = await this.calculateTradeValue(requestingItems);
      const fairnessScore = this.calculateFairnessScore(offerValue, requestValue);

      const tradeOffer = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        initiatorId: traderUserId,
        targetUserId,
        status: 'pending',
        offeringItems,
        requestingItems,
        offerValue,
        requestValue,
        fairnessScore,
        message,
        isPublic,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + expiresIn),
        lastActivity: serverTimestamp(),
        chatHistory: [],
        viewCount: 0,
        interestCount: 0
      };

      const docRef = await addDoc(collection(db, 'tradeOffers'), tradeOffer);
      
      // Create notifications
      if (targetUserId) {
        await this.createTradeNotification(targetUserId, {
          type: 'direct_trade_offer',
          tradeId: docRef.id,
          initiatorId: traderUserId,
          message: 'You received a new trade offer!'
        });
      }

      analyticsService.logEvent('trade_offer_created', {
        category: EventCategory.TRADING,
        user_id: traderUserId,
        trade_id: docRef.id,
        offer_value: offerValue,
        request_value: requestValue,
        fairness_score: fairnessScore,
        is_public: isPublic
      });

      return { success: true, tradeId: docRef.id, tradeOffer };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'create_trade_offer'
      });
      throw error;
    }
  }

  async respondToTradeOffer(userId, tradeId, response) {
    try {
      const { action, counterOffer, message } = response; // 'accept', 'decline', 'counter'

      const tradeRef = doc(db, 'tradeOffers', tradeId);
      const tradeSnap = await getDoc(tradeRef);
      
      if (!tradeSnap.exists()) {
        throw new Error('Trade offer not found');
      }

      const trade = tradeSnap.data();
      
      // Verify user can respond to this trade
      if (trade.targetUserId !== userId && trade.initiatorId !== userId) {
        throw new Error('You are not authorized to respond to this trade');
      }

      if (trade.status !== 'pending') {
        throw new Error('This trade offer is no longer active');
      }

      let updatedTrade = {};

      switch (action) {
        case 'accept':
          updatedTrade = await this.acceptTradeOffer(trade, userId);
          break;
        case 'decline':
          updatedTrade = await this.declineTradeOffer(trade, userId, message);
          break;
        case 'counter':
          updatedTrade = await this.createCounterOffer(trade, userId, counterOffer, message);
          break;
        default:
          throw new Error('Invalid response action');
      }

      await updateDoc(tradeRef, {
        ...updatedTrade,
        lastActivity: serverTimestamp()
      });

      return { success: true, trade: updatedTrade };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'respond_to_trade_offer'
      });
      throw error;
    }
  }

  async acceptTradeOffer(trade, acceptingUserId) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Final verification of item ownership and availability
        for (const item of trade.offeringItems) {
          const isAvailable = await this.verifyItemAvailableForTrade(
            trade.initiatorId, 
            item.itemId, 
            item.serialNumber
          );
          if (!isAvailable) {
            throw new Error(`Item ${item.name} #${item.serialNumber} is no longer available`);
          }
        }

        for (const item of trade.requestingItems) {
          const isAvailable = await this.verifyItemAvailableForTrade(
            acceptingUserId, 
            item.itemId, 
            item.serialNumber
          );
          if (!isAvailable) {
            throw new Error(`Item ${item.name} #${item.serialNumber} is no longer available`);
          }
        }

        // Execute the trade - transfer ownership
        await this.executeTradeTransfer(trade, acceptingUserId, transaction);

        // Update trade status
        const completedTrade = {
          status: 'completed',
          completedAt: serverTimestamp(),
          completedBy: acceptingUserId
        };

        // Create trade completion notifications
        await this.createTradeNotification(trade.initiatorId, {
          type: 'trade_completed',
          tradeId: trade.id,
          message: 'Your trade offer was accepted!'
        });

        await this.createTradeNotification(acceptingUserId, {
          type: 'trade_completed',
          tradeId: trade.id,
          message: 'Trade completed successfully!'
        });

        analyticsService.logEvent('trade_completed', {
          category: EventCategory.TRADING,
          trade_id: trade.id,
          initiator_id: trade.initiatorId,
          acceptor_id: acceptingUserId,
          offer_value: trade.offerValue,
          request_value: trade.requestValue
        });

        return completedTrade;
      });
    } catch (error) {
      throw error;
    }
  }

  async executeTradeTransfer(trade, acceptingUserId, transaction) {
    try {
      const now = new Date();
      const tradeId = trade.id || `trade_${Date.now()}`;

      // Transfer offered items to accepting user
      for (const item of trade.offeringItems) {
        const ownershipQuery = query(
          collection(db, 'collectableOwnership'),
          where('userId', '==', trade.initiatorId),
          where('itemId', '==', item.itemId),
          where('serialNumber', '==', item.serialNumber)
        );
        
        const ownershipSnap = await getDocs(ownershipQuery);
        if (!ownershipSnap.empty) {
          const ownershipDoc = ownershipSnap.docs[0];
          const ownershipRef = doc(db, 'collectableOwnership', ownershipDoc.id);
          
          transaction.update(ownershipRef, {
            userId: acceptingUserId,
            acquiredAt: now,
            source: 'trade',
            previousOwner: trade.initiatorId,
            tradeId,
            provenance: [
              ...(ownershipDoc.data().provenance || []),
              {
                event: 'traded',
                fromUser: trade.initiatorId,
                toUser: acceptingUserId,
                date: now,
                tradeId
              }
            ]
          });
        }
      }

      // Transfer requested items to initiating user
      for (const item of trade.requestingItems) {
        const ownershipQuery = query(
          collection(db, 'collectableOwnership'),
          where('userId', '==', acceptingUserId),
          where('itemId', '==', item.itemId),
          where('serialNumber', '==', item.serialNumber)
        );
        
        const ownershipSnap = await getDocs(ownershipQuery);
        if (!ownershipSnap.empty) {
          const ownershipDoc = ownershipSnap.docs[0];
          const ownershipRef = doc(db, 'collectableOwnership', ownershipDoc.id);
          
          transaction.update(ownershipRef, {
            userId: trade.initiatorId,
            acquiredAt: now,
            source: 'trade',
            previousOwner: acceptingUserId,
            tradeId,
            provenance: [
              ...(ownershipDoc.data().provenance || []),
              {
                event: 'traded',
                fromUser: acceptingUserId,
                toUser: trade.initiatorId,
                date: now,
                tradeId
              }
            ]
          });
        }
      }

      // Record trade completion
      const tradeRecord = {
        tradeId,
        initiatorId: trade.initiatorId,
        acceptorId: acceptingUserId,
        offeringItems: trade.offeringItems,
        requestingItems: trade.requestingItems,
        completedAt: now,
        offerValue: trade.offerValue,
        requestValue: trade.requestValue
      };

      transaction.set(doc(collection(db, 'completedTrades')), tradeRecord);

    } catch (error) {
      throw error;
    }
  }

  // TRADING BOARD & DISCOVERY

  async getTradingBoard(filters = {}) {
    try {
      const {
        rarity,
        category,
        maxValue,
        minValue,
        sortBy = 'newest',
        limit: queryLimit = 20
      } = filters;

      let q = query(
        collection(db, 'tradeOffers'),
        where('status', '==', 'pending'),
        where('isPublic', '==', true)
      );

      // Apply filters
      if (rarity) {
        q = query(q, where('offeringItems.rarity', 'array-contains', rarity));
      }

      if (maxValue) {
        q = query(q, where('offerValue', '<=', maxValue));
      }

      if (minValue) {
        q = query(q, where('offerValue', '>=', minValue));
      }

      // Apply sorting
      switch (sortBy) {
        case 'newest':
          q = query(q, orderBy('createdAt', 'desc'));
          break;
        case 'value_high':
          q = query(q, orderBy('offerValue', 'desc'));
          break;
        case 'value_low':
          q = query(q, orderBy('offerValue', 'asc'));
          break;
        case 'ending_soon':
          q = query(q, orderBy('expiresAt', 'asc'));
          break;
        case 'fair':
          q = query(q, orderBy('fairnessScore', 'desc'));
          break;
      }

      q = query(q, limit(queryLimit));

      const snapshot = await getDocs(q);
      const trades = snapshot.docs.map(doc => {
        const trade = { id: doc.id, ...doc.data() };
        return {
          ...trade,
          timeRemaining: this.calculateTimeRemaining(trade.expiresAt),
          fairnessLevel: this.getFairnessLevel(trade.fairnessScore),
          popularityScore: this.calculatePopularityScore(trade)
        };
      });

      return trades;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'get_trading_board'
      });
      return [];
    }
  }

  async getUserTrades(userId) {
    try {
      // Get trades where user is initiator or target
      const [sentTrades, receivedTrades] = await Promise.all([
        this.getUserSentTrades(userId),
        this.getUserReceivedTrades(userId)
      ]);

      return {
        sent: sentTrades,
        received: receivedTrades,
        active: [...sentTrades, ...receivedTrades].filter(trade => 
          ['pending', 'negotiating'].includes(trade.status)
        ),
        completed: [...sentTrades, ...receivedTrades].filter(trade => 
          trade.status === 'completed'
        )
      };
    } catch (error) {
      return { sent: [], received: [], active: [], completed: [] };
    }
  }

  async getUserSentTrades(userId) {
    const q = query(
      collection(db, 'tradeOffers'),
      where('initiatorId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getUserReceivedTrades(userId) {
    const q = query(
      collection(db, 'tradeOffers'),
      where('targetUserId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // TRADE CHAT & NEGOTIATION

  async sendTradeMessage(userId, tradeId, message) {
    try {
      const tradeRef = doc(db, 'tradeOffers', tradeId);
      const tradeSnap = await getDoc(tradeRef);
      
      if (!tradeSnap.exists()) {
        throw new Error('Trade not found');
      }

      const trade = tradeSnap.data();
      
      // Verify user can participate in this trade chat
      if (trade.initiatorId !== userId && trade.targetUserId !== userId) {
        throw new Error('You cannot participate in this trade chat');
      }

      const chatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: userId,
        message,
        timestamp: new Date(),
        type: 'text'
      };

      await updateDoc(tradeRef, {
        chatHistory: [...(trade.chatHistory || []), chatMessage],
        lastActivity: serverTimestamp()
      });

      // Notify other party
      const otherUserId = trade.initiatorId === userId ? trade.targetUserId : trade.initiatorId;
      await this.createTradeNotification(otherUserId, {
        type: 'trade_message',
        tradeId,
        senderId: userId,
        message: 'New message in trade chat'
      });

      return { success: true, messageId: chatMessage.id };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'send_trade_message'
      });
      throw error;
    }
  }

  subscribeToTradeChat(tradeId, callback) {
    try {
      const tradeRef = doc(db, 'tradeOffers', tradeId);
      
      const unsubscribe = onSnapshot(tradeRef, (doc) => {
        if (doc.exists()) {
          const trade = doc.data();
          callback({
            chatHistory: trade.chatHistory || [],
            status: trade.status,
            lastActivity: trade.lastActivity
          });
        }
      });

      this.chatSubscriptions.set(tradeId, unsubscribe);
      return unsubscribe;
    } catch (error) {
      return () => {};
    }
  }

  // BACKEND-VERIFIED TRADING SYSTEM

  async executeTradeTransaction(tradeId, acceptingUserId) {
    try {
      return await runTransaction(db, async (transaction) => {
        // 1. Get trade offer details
        const tradeDoc = await transaction.get(doc(db, 'tradeOffers', tradeId));
        if (!tradeDoc.exists()) {
          throw new Error('Trade offer not found');
        }

        const tradeData = tradeDoc.data();
        
        // 2. Validate trade status and permissions
        if (tradeData.status !== 'pending') {
          throw new Error('Trade is no longer pending');
        }

        if (tradeData.targetUserId !== acceptingUserId && !tradeData.isPublic) {
          throw new Error('You are not authorized to accept this trade');
        }

        if (tradeData.expiresAt < new Date()) {
          throw new Error('Trade offer has expired');
        }

        // 3. Verify both users still own their offered items
        const initiatorVerification = await this.verifyTradeItems(
          tradeData.initiatorId, 
          tradeData.offeringItems,
          transaction
        );

        const acceptorVerification = await this.verifyTradeItems(
          acceptingUserId,
          tradeData.requestingItems, 
          transaction
        );

        if (!initiatorVerification.valid) {
          throw new Error(`Initiator missing items: ${initiatorVerification.missingItems.join(', ')}`);
        }

        if (!acceptorVerification.valid) {
          throw new Error(`Acceptor missing items: ${acceptorVerification.missingItems.join(', ')}`);
        }

        // 4. Perform the item transfers
        await this.transferTradeItems(
          tradeData.initiatorId,
          acceptingUserId,
          tradeData.offeringItems,
          transaction,
          tradeId,
          'giving'
        );

        await this.transferTradeItems(
          acceptingUserId,
          tradeData.initiatorId,
          tradeData.requestingItems,
          transaction,
          tradeId,
          'receiving'
        );

        // 5. Update trade status
        transaction.update(doc(db, 'tradeOffers', tradeId), {
          status: 'completed',
          acceptedBy: acceptingUserId,
          completedAt: serverTimestamp(),
          lastActivity: serverTimestamp()
        });

        // 6. Create trade completion record
        const completionRecord = {
          tradeId,
          initiatorId: tradeData.initiatorId,
          acceptorId: acceptingUserId,
          itemsExchanged: {
            initiatorGave: tradeData.offeringItems,
            acceptorGave: tradeData.requestingItems
          },
          tradeValue: {
            initiatorValue: tradeData.offerValue,
            acceptorValue: tradeData.requestValue
          },
          completedAt: serverTimestamp(),
          verificationHash: this.generateTradeHash(tradeData)
        };

        transaction.set(doc(collection(db, 'completedTrades')), completionRecord);

        // 7. Update user trading stats
        transaction.update(doc(db, 'users', tradeData.initiatorId), {
          'stats.tradesCompleted': increment(1),
          'stats.totalTradeValue': increment(tradeData.requestValue),
          'lastActivity': serverTimestamp()
        });

        transaction.update(doc(db, 'users', acceptingUserId), {
          'stats.tradesCompleted': increment(1),
          'stats.totalTradeValue': increment(tradeData.offerValue),
          'lastActivity': serverTimestamp()
        });

        return {
          success: true,
          tradeId,
          completionRecord
        };
      });
    } catch (error) {
      analyticsService.logEvent('trade_execution_failed', {
        category: EventCategory.TRADING,
        trade_id: tradeId,
        error: error.message
      });

      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'execute_trade',
        trade_id: tradeId
      });
      
      throw error;
    }
  }

  async verifyTradeItems(userId, itemsToVerify, transaction) {
    const verification = {
      valid: true,
      missingItems: [],
      itemSnapshots: []
    };

    for (const item of itemsToVerify) {
      const inventoryQuery = query(
        collection(db, 'userInventory', userId, 'items'),
        where('itemId', '==', item.itemId),
        where('serialNumber', '==', item.serialNumber)
      );

      const inventorySnapshot = await getDocs(inventoryQuery);
      
      if (inventorySnapshot.empty) {
        verification.valid = false;
        verification.missingItems.push(`${item.name} #${item.serialNumber}`);
      } else {
        verification.itemSnapshots.push({
          docId: inventorySnapshot.docs[0].id,
          data: inventorySnapshot.docs[0].data()
        });
      }
    }

    return verification;
  }

  async transferTradeItems(fromUserId, toUserId, items, transaction, tradeId, direction) {
    for (const item of items) {
      // Find the specific item in sender's inventory
      const senderQuery = query(
        collection(db, 'userInventory', fromUserId, 'items'),
        where('itemId', '==', item.itemId),
        where('serialNumber', '==', item.serialNumber),
        limit(1)
      );

      const senderSnapshot = await getDocs(senderQuery);
      if (senderSnapshot.empty) {
        throw new Error(`Item ${item.name} #${item.serialNumber} not found in sender inventory`);
      }

      const senderItemDoc = senderSnapshot.docs[0];
      const itemData = senderItemDoc.data();

      // Remove from sender's inventory
      transaction.delete(doc(db, 'userInventory', fromUserId, 'items', senderItemDoc.id));

      // Add to receiver's inventory with trade history
      const receiverItemData = {
        ...itemData,
        previousOwner: fromUserId,
        tradeHistory: arrayUnion({
          tradeId,
          fromUserId,
          toUserId,
          timestamp: serverTimestamp(),
          direction
        }),
        lastTradeDate: serverTimestamp()
      };

      transaction.set(
        doc(collection(db, 'userInventory', toUserId, 'items')),
        receiverItemData
      );
    }
  }

  generateTradeHash(tradeData) {
    // Generate a verification hash for trade integrity
    const hashData = {
      initiator: tradeData.initiatorId,
      acceptor: tradeData.targetUserId,
      offering: tradeData.offeringItems.map(i => `${i.itemId}-${i.serialNumber}`).join('|'),
      requesting: tradeData.requestingItems.map(i => `${i.itemId}-${i.serialNumber}`).join('|'),
      timestamp: Date.now()
    };
    
    return btoa(JSON.stringify(hashData));
  }

  // ANTI-FRAUD MEASURES

  async validateTradeOffer(traderUserId, tradeData) {
    try {
      // 1. Rate limiting
      const recentTrades = await this.getRecentTradeOffers(traderUserId, 3600000); // 1 hour
      if (recentTrades.length > 20) {
        throw new Error('Too many trade offers in the last hour');
      }

      // 2. Value disparity check
      const valueDifference = Math.abs(tradeData.offerValue - tradeData.requestValue);
      const averageValue = (tradeData.offerValue + tradeData.requestValue) / 2;
      const disparityRatio = valueDifference / averageValue;

      if (disparityRatio > 0.8) { // 80% value difference
        // Flag for manual review but don't block
        await this.flagSuspiciousTrade(traderUserId, 'high_value_disparity', {
          offerValue: tradeData.offerValue,
          requestValue: tradeData.requestValue,
          disparityRatio
        });
      }

      // 3. Duplicate offer check
      const duplicateCheck = await this.checkForDuplicateOffer(traderUserId, tradeData);
      if (duplicateCheck) {
        throw new Error('Identical trade offer already exists');
      }

      // 4. Account status check
      const userDoc = await getDoc(doc(db, 'users', traderUserId));
      const userData = userDoc.data();
      
      if (userData.tradingStatus === 'suspended') {
        throw new Error('Your trading privileges are currently suspended');
      }

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'trading_validation',
        action: 'validate_trade_offer',
        user_id: traderUserId
      });
      throw error;
    }
  }

  async getRecentTradeOffers(userId, timeWindowMs) {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const q = query(
      collection(db, 'tradeOffers'),
      where('initiatorId', '==', userId),
      where('createdAt', '>=', cutoff)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async checkForDuplicateOffer(userId, tradeData) {
    // Check for identical offers in the last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const offeringItemIds = tradeData.offeringItems.map(i => i.itemId).sort();
    const requestingItemIds = tradeData.requestingItems.map(i => i.itemId).sort();

    const q = query(
      collection(db, 'tradeOffers'),
      where('initiatorId', '==', userId),
      where('createdAt', '>=', cutoff),
      where('status', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    
    for (const doc of snapshot.docs) {
      const existingTrade = doc.data();
      const existingOffering = existingTrade.offeringItems.map(i => i.itemId).sort();
      const existingRequesting = existingTrade.requestingItems.map(i => i.itemId).sort();

      if (JSON.stringify(offeringItemIds) === JSON.stringify(existingOffering) &&
          JSON.stringify(requestingItemIds) === JSON.stringify(existingRequesting)) {
        return true;
      }
    }

    return false;
  }

  async flagSuspiciousTrade(userId, flagType, details) {
    const flag = {
      userId,
      flagType,
      details,
      timestamp: new Date(),
      category: 'trading',
      severity: this.getTradeFlagSeverity(flagType)
    };

    await addDoc(collection(db, 'tradingFlags'), flag);

    analyticsService.logEvent('suspicious_trade_flagged', {
      category: EventCategory.TRADING,
      user_id: userId,
      flag_type: flagType,
      severity: flag.severity
    });
  }

  getTradeFlagSeverity(flagType) {
    const severityMap = {
      high_value_disparity: 'medium',
      rapid_trading: 'medium',
      suspicious_pattern: 'high',
      duplicate_offer: 'low'
    };
    return severityMap[flagType] || 'low';
  }

  // TRADE VALUE CALCULATION

  async calculateTradeValue(items) {
    let totalValue = 0;
    
    for (const item of items) {
      const itemValue = await this.getItemMarketValue(item.itemId, item.rarity);
      totalValue += itemValue;
    }

    return totalValue;
  }

  async getItemMarketValue(itemId, rarity) {
    try {
      // Check recent completed trades for this item
      const recentTradesQuery = query(
        collection(db, 'completedTrades'),
        where('itemsExchanged.initiatorGave', 'array-contains', { itemId }),
        orderBy('completedAt', 'desc'),
        limit(10)
      );

      const tradesSnapshot = await getDocs(recentTradesQuery);
      
      if (!tradesSnapshot.empty) {
        // Calculate average trade value
        let totalValue = 0;
        let count = 0;
        
        tradesSnapshot.docs.forEach(doc => {
          const trade = doc.data();
          // This would need more sophisticated value extraction
          totalValue += trade.tradeValue.initiatorValue;
          count++;
        });

        return Math.round(totalValue / count);
      }

      // Fallback to base rarity values
      const rarityValues = {
        standard: 100,
        rare: 500,
        ultra_rare: 1500,
        legendary: 5000,
        mythic: 15000
      };

      return rarityValues[rarity] || 100;
    } catch (error) {
      // Return conservative estimate
      return 100;
    }
  }

  // TRADE CANCELLATION & EXPIRY

  async cancelTradeOffer(userId, tradeId) {
    try {
      return await runTransaction(db, async (transaction) => {
        const tradeDoc = await transaction.get(doc(db, 'tradeOffers', tradeId));
        
        if (!tradeDoc.exists()) {
          throw new Error('Trade offer not found');
        }

        const tradeData = tradeDoc.data();
        
        if (tradeData.initiatorId !== userId) {
          throw new Error('You can only cancel your own trade offers');
        }

        if (tradeData.status !== 'pending') {
          throw new Error('Cannot cancel a trade that is not pending');
        }

        // Update trade status
        transaction.update(doc(db, 'tradeOffers', tradeId), {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: userId,
          lastActivity: serverTimestamp()
        });

        return { success: true };
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'cancel_trade',
        user_id: userId,
        trade_id: tradeId
      });
      throw error;
    }
  }

  async cleanupExpiredTrades() {
    try {
      const expiredQuery = query(
        collection(db, 'tradeOffers'),
        where('status', '==', 'pending'),
        where('expiresAt', '<', new Date())
      );

      const expiredSnapshot = await getDocs(expiredQuery);
      
      const batch = writeBatch(db);
      expiredSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'expired',
          expiredAt: serverTimestamp()
        });
      });

      await batch.commit();

      analyticsService.logEvent('expired_trades_cleaned', {
        category: EventCategory.TRADING,
        count: expiredSnapshot.docs.length
      });

      return { cleaned: expiredSnapshot.docs.length };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_trading',
        action: 'cleanup_expired_trades'
      });
      throw error;
    }
  }

  // TRADE VALUATION & FAIRNESS

  async calculateTradeValue(items) {
    try {
      let totalValue = 0;

      for (const item of items) {
        // Get current market value
        const itemValue = await this.getItemMarketValue(item.itemId, item.rarity);
        
        // Apply serial number premium
        const serialPremium = this.calculateSerialPremium(item.serialNumber, item.totalProduction);
        
        // Apply condition modifier
        const conditionModifier = this.getConditionModifier(item.condition || 'mint');
        
        const finalValue = itemValue * (1 + serialPremium) * conditionModifier;
        totalValue += finalValue;
      }

      return Math.round(totalValue);
    } catch (error) {
      return 0;
    }
  }

  calculateFairnessScore(offerValue, requestValue) {
    if (requestValue === 0) return 100;
    
    const ratio = offerValue / requestValue;
    
    // Score based on how close to 1:1 the trade is
    if (ratio >= 0.9 && ratio <= 1.1) return 100; // Very fair
    if (ratio >= 0.8 && ratio <= 1.25) return 80;  // Fair
    if (ratio >= 0.7 && ratio <= 1.4) return 60;   // Moderate
    if (ratio >= 0.6 && ratio <= 1.6) return 40;   // Unbalanced
    return 20; // Very unbalanced
  }

  getFairnessLevel(score) {
    if (score >= 90) return 'Very Fair';
    if (score >= 70) return 'Fair';
    if (score >= 50) return 'Moderate';
    if (score >= 30) return 'Unbalanced';
    return 'Very Unbalanced';
  }

  calculateSerialPremium(serialNumber, totalProduction) {
    if (!serialNumber || !totalProduction) return 0;
    
    // Special serials get premium
    if (serialNumber === 1) return 0.5; // 50% premium for #1
    if (serialNumber === totalProduction) return 0.3; // 30% premium for last
    if ([69, 420, 777, 1337].includes(serialNumber)) return 0.2; // 20% for meme numbers
    if (serialNumber <= 10) return 0.15; // 15% for top 10
    if (serialNumber % 100 === 0) return 0.1; // 10% for round hundreds
    
    return 0; // No premium
  }

  getConditionModifier(condition) {
    const modifiers = {
      mint: 1.0,
      'near_mint': 0.95,
      excellent: 0.9,
      good: 0.8,
      fair: 0.6,
      poor: 0.4
    };
    return modifiers[condition] || 1.0;
  }

  async getItemMarketValue(itemId, rarity) {
    // Simplified market value calculation
    const baseValues = {
      common: 100,
      rare: 500,
      ultra_rare: 1500,
      legendary: 5000,
      mythic: 15000
    };
    
    return baseValues[rarity] || 100;
  }

  // UTILITY FUNCTIONS

  async verifyItemOwnership(userId, itemId, serialNumber) {
    try {
      const q = query(
        collection(db, 'collectableOwnership'),
        where('userId', '==', userId),
        where('itemId', '==', itemId),
        where('serialNumber', '==', serialNumber)
      );

      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      return false;
    }
  }

  async verifyItemAvailableForTrade(userId, itemId, serialNumber) {
    try {
      // Check ownership
      const isOwner = await this.verifyItemOwnership(userId, itemId, serialNumber);
      if (!isOwner) return false;

      // Check if item is not locked in another pending trade
      const q = query(
        collection(db, 'tradeOffers'),
        where('status', 'in', ['pending', 'negotiating'])
      );

      const snapshot = await getDocs(q);
      for (const doc of snapshot.docs) {
        const trade = doc.data();
        
        // Check if item is in any active trade
        const allItems = [...(trade.offeringItems || []), ...(trade.requestingItems || [])];
        const itemInTrade = allItems.some(item => 
          item.itemId === itemId && 
          item.serialNumber === serialNumber &&
          (trade.initiatorId === userId || trade.targetUserId === userId)
        );
        
        if (itemInTrade) return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  calculateTimeRemaining(expiresAt) {
    if (!expiresAt) return null;
    
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return { expired: true };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, totalMs: diff };
  }

  calculatePopularityScore(trade) {
    const baseScore = trade.viewCount || 0;
    const interestBonus = (trade.interestCount || 0) * 2;
    const fairnessBonus = trade.fairnessScore > 80 ? 10 : 0;
    
    return baseScore + interestBonus + fairnessBonus;
  }

  async createTradeNotification(userId, notification) {
    try {
      const notificationDoc = {
        userId,
        ...notification,
        createdAt: serverTimestamp(),
        read: false
      };

      await addDoc(collection(db, 'notifications'), notificationDoc);
    } catch (error) {
      // Silently fail notifications
    }
  }

  async declineTradeOffer(trade, userId, message) {
    return {
      status: 'declined',
      declinedAt: serverTimestamp(),
      declinedBy: userId,
      declineMessage: message
    };
  }

  async createCounterOffer(trade, userId, counterOffer, message) {
    return {
      status: 'negotiating',
      counterOffer: {
        ...counterOffer,
        createdBy: userId,
        createdAt: serverTimestamp(),
        message
      },
      lastCounterAt: serverTimestamp()
    };
  }

  cleanup() {
    // Clean up subscriptions and timers
    this.chatSubscriptions.forEach(unsubscribe => unsubscribe());
    this.activeTradeWatchers.forEach(unsubscribe => unsubscribe());
    this.negotiationTimers.forEach(timer => clearTimeout(timer));
    
    this.chatSubscriptions.clear();
    this.activeTradeWatchers.clear();
    this.negotiationTimers.clear();
  }
}

export default new CollectibleTradingService();
