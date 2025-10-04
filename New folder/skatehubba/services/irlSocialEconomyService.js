import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class IRLSocialEconomyService {
  constructor() {
    this.activeMarkets = new Map();
    this.tradingPairs = new Map();
    this.shopCredits = new Map();
    this.giftingQueue = new Map();
  }

  // MULTI-ITEM TRADING SYSTEM

  async createTradeOffer(fromUserId, toUserId, tradeData) {
    try {
      const {
        offeredItems, // Array of { type: 'gear'|'currency'|'collectible', itemId, quantity, metadata }
        requestedItems, // Array of requested items
        message = '',
        expiration = 24 * 60 * 60 * 1000, // 24 hours default
        isPublic = false // If true, anyone can accept
      } = tradeData;

      // Validate trade offer
      const validation = await this.validateTradeOffer(fromUserId, offeredItems);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const tradeOffer = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fromUserId,
        toUserId: isPublic ? null : toUserId,
        isPublic,
        status: 'pending',
        
        offeredItems: offeredItems.map(item => ({
          ...item,
          reservationId: this.generateReservationId(),
          reserved: true
        })),
        requestedItems,
        
        message,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + expiration),
        
        tradeHistory: [{
          action: 'created',
          userId: fromUserId,
          timestamp: serverTimestamp(),
          data: { offeredCount: offeredItems.length, requestedCount: requestedItems.length }
        }],
        
        // Additional trade features
        features: {
          counterOfferAllowed: true,
          partialTradeAllowed: false,
          requiresVerification: this.requiresVerification(offeredItems, requestedItems),
          estimatedValue: await this.estimateTradeValue(offeredItems, requestedItems)
        }
      };

      // Reserve offered items
      await this.reserveItemsForTrade(fromUserId, tradeOffer.offeredItems);

      const docRef = await addDoc(collection(db, 'tradeOffers'), tradeOffer);
      tradeOffer.id = docRef.id;

      // Notify recipient if specific trade
      if (!isPublic && toUserId) {
        await this.notifyTradeOffer(toUserId, tradeOffer);
      }

      // Add to public market if public trade
      if (isPublic) {
        await this.addToPublicMarket(tradeOffer);
      }

      analyticsService.logEvent('trade_offer_created', {
        category: EventCategory.TRADING,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        is_public: isPublic,
        offered_items_count: offeredItems.length,
        requested_items_count: requestedItems.length,
        estimated_value: tradeOffer.features.estimatedValue
      });

      return tradeOffer;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'irl_social_economy',
        action: 'create_trade_offer'
      });
      throw error;
    }
  }

  async acceptTradeOffer(tradeOfferId, acceptingUserId, acceptanceData = {}) {
    try {
      const tradeRef = doc(db, 'tradeOffers', tradeOfferId);
      
      return await runTransaction(db, async (transaction) => {
        const tradeSnap = await transaction.get(tradeRef);
        if (!tradeSnap.exists()) throw new Error('Trade offer not found');

        const trade = tradeSnap.data();
        
        // Validate acceptance
        if (trade.status !== 'pending') {
          throw new Error('Trade offer is no longer available');
        }
        
        if (trade.expiresAt.toDate() < new Date()) {
          throw new Error('Trade offer has expired');
        }
        
        if (!trade.isPublic && trade.toUserId !== acceptingUserId) {
          throw new Error('Not authorized to accept this trade');
        }

        // Validate accepting user has requested items
        const hasItems = await this.validateUserHasItems(acceptingUserId, trade.requestedItems);
        if (!hasItems.valid) {
          throw new Error(`Missing required items: ${hasItems.missing.join(', ')}`);
        }

        // Execute the trade
        await this.executeTradeTransaction(transaction, trade, acceptingUserId);

        // Update trade status
        transaction.update(tradeRef, {
          status: 'completed',
          acceptedBy: acceptingUserId,
          acceptedAt: serverTimestamp(),
          tradeHistory: [...trade.tradeHistory, {
            action: 'accepted',
            userId: acceptingUserId,
            timestamp: serverTimestamp(),
            data: acceptanceData
          }]
        });

        // Log successful trade
        analyticsService.logEvent('trade_completed', {
          category: EventCategory.TRADING,
          trade_id: tradeOfferId,
          from_user_id: trade.fromUserId,
          to_user_id: acceptingUserId,
          items_count: trade.offeredItems.length + trade.requestedItems.length
        });

        return { success: true, tradeId: tradeOfferId };
      });
    } catch (error) {
      throw error;
    }
  }

  async createCounterOffer(originalTradeId, counterOfferData) {
    try {
      const originalTrade = await getDoc(doc(db, 'tradeOffers', originalTradeId));
      if (!originalTrade.exists()) throw new Error('Original trade not found');

      const originalData = originalTrade.data();
      
      const counterOffer = await this.createTradeOffer(
        counterOfferData.fromUserId || originalData.toUserId,
        originalData.fromUserId,
        {
          ...counterOfferData,
          parentTradeId: originalTradeId,
          isCounterOffer: true
        }
      );

      // Link trades
      await updateDoc(doc(db, 'tradeOffers', originalTradeId), {
        counterOffers: [...(originalData.counterOffers || []), counterOffer.id],
        lastActivity: serverTimestamp()
      });

      return counterOffer;
    } catch (error) {
      throw error;
    }
  }

  // GIFTING SYSTEM

  async sendGift(fromUserId, toUserId, giftData) {
    try {
      const {
        items, // Array of items to gift
        message = '',
        occasion = 'just_because', // 'birthday', 'achievement', 'thanks', 'just_because'
        isAnonymous = false,
        scheduledDelivery = null // Date object for scheduled delivery
      } = giftData;

      // Validate gift
      const validation = await this.validateGiftItems(fromUserId, items);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const gift = {
        id: `gift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fromUserId: isAnonymous ? null : fromUserId,
        toUserId,
        items,
        message,
        occasion,
        isAnonymous,
        
        status: scheduledDelivery ? 'scheduled' : 'pending',
        createdAt: serverTimestamp(),
        scheduledFor: scheduledDelivery,
        deliveredAt: null,
        openedAt: null,
        
        // Gift presentation
        presentation: {
          wrapping: this.selectGiftWrapping(occasion),
          animation: this.selectGiftAnimation(items),
          sound: 'gift_notification.wav'
        },
        
        // Social features
        allowPublicThank: !isAnonymous,
        shareOnFeed: false,
        
        metadata: {
          estimatedValue: await this.estimateItemsValue(items),
          giftReason: occasion,
          relationship: await this.getUserRelationship(fromUserId, toUserId)
        }
      };

      // Remove items from sender
      await this.deductItemsFromUser(fromUserId, items);

      const docRef = await addDoc(collection(db, 'gifts'), gift);
      gift.id = docRef.id;

      if (!scheduledDelivery) {
        await this.deliverGift(gift.id);
      } else {
        await this.scheduleGiftDelivery(gift);
      }

      analyticsService.logEvent('gift_sent', {
        category: EventCategory.SOCIAL,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        occasion,
        is_anonymous: isAnonymous,
        items_count: items.length,
        estimated_value: gift.metadata.estimatedValue
      });

      return gift;
    } catch (error) {
      throw error;
    }
  }

  async deliverGift(giftId) {
    try {
      const giftRef = doc(db, 'gifts', giftId);
      const giftSnap = await getDoc(giftRef);
      
      if (!giftSnap.exists()) throw new Error('Gift not found');
      
      const gift = giftSnap.data();
      
      await updateDoc(giftRef, {
        status: 'delivered',
        deliveredAt: serverTimestamp()
      });

      // Notify recipient
      await this.notifyGiftDelivery(gift);

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async openGift(giftId, userId) {
    try {
      const giftRef = doc(db, 'gifts', giftId);
      
      return await runTransaction(db, async (transaction) => {
        const giftSnap = await transaction.get(giftRef);
        if (!giftSnap.exists()) throw new Error('Gift not found');

        const gift = giftSnap.data();
        
        if (gift.toUserId !== userId) {
          throw new Error('Not authorized to open this gift');
        }
        
        if (gift.status !== 'delivered') {
          throw new Error('Gift not ready to open');
        }

        if (gift.openedAt) {
          throw new Error('Gift already opened');
        }

        // Add items to recipient
        await this.addItemsToUser(transaction, userId, gift.items);

        // Mark gift as opened
        transaction.update(giftRef, {
          status: 'opened',
          openedAt: serverTimestamp()
        });

        // Create thank you prompt if not anonymous
        if (!gift.isAnonymous && gift.allowPublicThank) {
          await this.createThankYouPrompt(gift);
        }

        analyticsService.logEvent('gift_opened', {
          category: EventCategory.SOCIAL,
          gift_id: giftId,
          user_id: userId,
          occasion: gift.occasion
        });

        return { 
          success: true, 
          items: gift.items,
          presentation: gift.presentation 
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // SHOP CREDIT & IOU SYSTEM

  async createShopCredit(shopId, userId, creditData) {
    try {
      const {
        amount,
        source = 'manual', // 'manual', 'return', 'promotion', 'loyalty'
        description = '',
        expirationDays = 365,
        transferrable = false
      } = creditData;

      const shopCredit = {
        id: `credit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        shopId,
        userId,
        amount,
        remainingAmount: amount,
        source,
        description,
        
        status: 'active',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + (expirationDays * 24 * 60 * 60 * 1000)),
        
        transferrable,
        usageHistory: [],
        
        metadata: {
          originalAmount: amount,
          shopName: await this.getShopName(shopId),
          issuedBy: 'system'
        }
      };

      await addDoc(collection(db, 'shopCredits'), shopCredit);

      // Notify user of new credit
      await this.notifyShopCredit(userId, shopCredit);

      analyticsService.logEvent('shop_credit_created', {
        category: EventCategory.ECONOMY,
        shop_id: shopId,
        user_id: userId,
        amount,
        source
      });

      return shopCredit;
    } catch (error) {
      throw error;
    }
  }

  async useShopCredit(creditId, userId, amount, purchaseData) {
    try {
      const creditRef = doc(db, 'shopCredits', creditId);
      
      return await runTransaction(db, async (transaction) => {
        const creditSnap = await transaction.get(creditRef);
        if (!creditSnap.exists()) throw new Error('Shop credit not found');

        const credit = creditSnap.data();
        
        // Validate usage
        if (credit.userId !== userId) {
          throw new Error('Not authorized to use this credit');
        }
        
        if (credit.status !== 'active') {
          throw new Error('Credit is not active');
        }
        
        if (credit.expiresAt.toDate() < new Date()) {
          throw new Error('Credit has expired');
        }
        
        if (credit.remainingAmount < amount) {
          throw new Error('Insufficient credit balance');
        }

        // Update credit
        const newRemainingAmount = credit.remainingAmount - amount;
        const newStatus = newRemainingAmount === 0 ? 'used' : 'active';
        
        const usageRecord = {
          amount,
          usedAt: serverTimestamp(),
          purchaseData,
          remainingAfter: newRemainingAmount
        };

        transaction.update(creditRef, {
          remainingAmount: newRemainingAmount,
          status: newStatus,
          usageHistory: [...credit.usageHistory, usageRecord],
          lastUsed: serverTimestamp()
        });

        return { success: true, remainingAmount: newRemainingAmount };
      });
    } catch (error) {
      throw error;
    }
  }

  async createIOU(fromUserId, toUserId, iouData) {
    try {
      const {
        amount,
        currency = 'hubbaBucks', // 'hubbaBucks', 'usd', 'custom'
        description,
        dueDate = null,
        interestRate = 0,
        collateral = null,
        repaymentPlan = null
      } = iouData;

      const iou = {
        id: `iou_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fromUserId, // Debtor
        toUserId, // Creditor
        amount,
        remainingAmount: amount,
        currency,
        description,
        
        status: 'pending', // 'pending', 'active', 'paid', 'defaulted', 'forgiven'
        createdAt: serverTimestamp(),
        dueDate,
        
        terms: {
          interestRate,
          collateral,
          repaymentPlan,
          lateFee: 0.05, // 5% late fee
          gracePeriod: 7 * 24 * 60 * 60 * 1000 // 7 days
        },
        
        repaymentHistory: [],
        lastPayment: null,
        
        // Social features
        isPublic: false,
        allowPartialPayments: true,
        autoReminders: true,
        
        metadata: {
          relationship: await this.getUserRelationship(fromUserId, toUserId),
          creditScore: await this.getUserCreditScore(fromUserId)
        }
      };

      await addDoc(collection(db, 'ious'), iou);

      // Notify creditor of IOU request
      await this.notifyIOURequest(toUserId, iou);

      analyticsService.logEvent('iou_created', {
        category: EventCategory.ECONOMY,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount,
        currency
      });

      return iou;
    } catch (error) {
      throw error;
    }
  }

  async acceptIOU(iouId, creditorUserId) {
    try {
      const iouRef = doc(db, 'ious', iouId);
      
      return await runTransaction(db, async (transaction) => {
        const iouSnap = await transaction.get(iouRef);
        if (!iouSnap.exists()) throw new Error('IOU not found');

        const iou = iouSnap.data();
        
        if (iou.toUserId !== creditorUserId) {
          throw new Error('Not authorized to accept this IOU');
        }
        
        if (iou.status !== 'pending') {
          throw new Error('IOU is no longer pending');
        }

        // Transfer funds to debtor
        if (iou.currency === 'hubbaBucks') {
          await this.transferHubbaBucks(transaction, creditorUserId, iou.fromUserId, iou.amount);
        }

        transaction.update(iouRef, {
          status: 'active',
          acceptedAt: serverTimestamp()
        });

        // Schedule reminders if enabled
        if (iou.autoReminders && iou.dueDate) {
          await this.scheduleIOUReminders(iou);
        }

        return { success: true };
      });
    } catch (error) {
      throw error;
    }
  }

  async repayIOU(iouId, debtorUserId, amount) {
    try {
      const iouRef = doc(db, 'ious', iouId);
      
      return await runTransaction(db, async (transaction) => {
        const iouSnap = await transaction.get(iouRef);
        if (!iouSnap.exists()) throw new Error('IOU not found');

        const iou = iouSnap.data();
        
        if (iou.fromUserId !== debtorUserId) {
          throw new Error('Not authorized to repay this IOU');
        }
        
        if (iou.status !== 'active') {
          throw new Error('IOU is not active');
        }
        
        if (amount > iou.remainingAmount) {
          throw new Error('Payment amount exceeds remaining debt');
        }

        // Calculate any interest or fees
        const payment = await this.calculateIOUPayment(iou, amount);

        // Transfer payment to creditor
        if (iou.currency === 'hubbaBucks') {
          await this.transferHubbaBucks(transaction, debtorUserId, iou.toUserId, payment.totalAmount);
        }

        // Update IOU
        const newRemainingAmount = iou.remainingAmount - payment.principalAmount;
        const newStatus = newRemainingAmount === 0 ? 'paid' : 'active';
        
        const paymentRecord = {
          amount: payment.totalAmount,
          principalAmount: payment.principalAmount,
          interestAmount: payment.interestAmount,
          feeAmount: payment.feeAmount,
          paidAt: serverTimestamp(),
          remainingAfter: newRemainingAmount
        };

        transaction.update(iouRef, {
          remainingAmount: newRemainingAmount,
          status: newStatus,
          repaymentHistory: [...iou.repaymentHistory, paymentRecord],
          lastPayment: serverTimestamp()
        });

        // Notify creditor of payment
        await this.notifyIOUPayment(iou.toUserId, iou, paymentRecord);

        return { success: true, remainingAmount: newRemainingAmount, payment };
      });
    } catch (error) {
      throw error;
    }
  }

  // UTILITY FUNCTIONS

  async validateTradeOffer(userId, offeredItems) {
    try {
      const userProfile = await getDoc(doc(db, 'userProfiles', userId));
      if (!userProfile.exists()) return { valid: false, error: 'User not found' };

      const userData = userProfile.data();
      
      for (const item of offeredItems) {
        switch (item.type) {
          case 'currency':
            if (item.itemId === 'hubbaBucks' && (userData.hubbaBucks || 0) < item.quantity) {
              return { valid: false, error: 'Insufficient Hubba Bucks' };
            }
            break;
          case 'gear':
            const hasGear = userData.avatarGear?.find(g => g.id === item.itemId);
            if (!hasGear || hasGear.quantity < item.quantity) {
              return { valid: false, error: `Insufficient ${item.itemId}` };
            }
            break;
          case 'collectible':
            const hasCollectible = userData.collectibles?.find(c => c.id === item.itemId);
            if (!hasCollectible || hasCollectible.quantity < item.quantity) {
              return { valid: false, error: `Don't own ${item.itemId}` };
            }
            break;
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  requiresVerification(offeredItems, requestedItems) {
    const allItems = [...offeredItems, ...requestedItems];
    const highValueThreshold = 1000; // Hubba Bucks equivalent
    
    return allItems.some(item => 
      item.metadata?.value > highValueThreshold || 
      item.metadata?.rarity === 'legendary'
    );
  }

  async estimateTradeValue(offeredItems, requestedItems) {
    const estimateItemValue = async (item) => {
      // In production, this would use market data
      switch (item.type) {
        case 'currency':
          return item.itemId === 'hubbaBucks' ? item.quantity : item.quantity * 100;
        case 'gear':
          return item.metadata?.value || 50;
        case 'collectible':
          return item.metadata?.marketValue || 200;
        default:
          return 0;
      }
    };

    const offeredValue = await Promise.all(offeredItems.map(estimateItemValue));
    const requestedValue = await Promise.all(requestedItems.map(estimateItemValue));

    return {
      offered: offeredValue.reduce((a, b) => a + b, 0),
      requested: requestedValue.reduce((a, b) => a + b, 0),
      fairness: offeredValue.reduce((a, b) => a + b, 0) / requestedValue.reduce((a, b) => a + b, 0)
    };
  }

  async reserveItemsForTrade(userId, items) {
    const reservations = items.map(item => ({
      userId,
      itemType: item.type,
      itemId: item.itemId,
      quantity: item.quantity,
      reservationId: item.reservationId,
      reservedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }));

    await Promise.all(
      reservations.map(reservation => 
        addDoc(collection(db, 'itemReservations'), reservation)
      )
    );
  }

  async validateUserHasItems(userId, items) {
    const userProfile = await getDoc(doc(db, 'userProfiles', userId));
    if (!userProfile.exists()) return { valid: false, missing: ['user profile'] };

    const userData = userProfile.data();
    const missing = [];

    for (const item of items) {
      switch (item.type) {
        case 'currency':
          if (item.itemId === 'hubbaBucks' && (userData.hubbaBucks || 0) < item.quantity) {
            missing.push(`${item.quantity} Hubba Bucks`);
          }
          break;
        case 'gear':
          const hasGear = userData.avatarGear?.find(g => g.id === item.itemId);
          if (!hasGear || hasGear.quantity < item.quantity) {
            missing.push(item.itemId);
          }
          break;
        case 'collectible':
          const hasCollectible = userData.collectibles?.find(c => c.id === item.itemId);
          if (!hasCollectible || hasCollectible.quantity < item.quantity) {
            missing.push(item.itemId);
          }
          break;
      }
    }

    return { valid: missing.length === 0, missing };
  }

  async executeTradeTransaction(transaction, trade, acceptingUserId) {
    // Remove offered items from original owner and add to accepting user
    await this.transferItems(transaction, trade.fromUserId, acceptingUserId, trade.offeredItems);
    
    // Remove requested items from accepting user and add to original owner
    await this.transferItems(transaction, acceptingUserId, trade.fromUserId, trade.requestedItems);
    
    // Release reservations
    await this.releaseItemReservations(trade.offeredItems);
  }

  async transferItems(transaction, fromUserId, toUserId, items) {
    for (const item of items) {
      switch (item.type) {
        case 'currency':
          await this.transferCurrency(transaction, fromUserId, toUserId, item.itemId, item.quantity);
          break;
        case 'gear':
          await this.transferGear(transaction, fromUserId, toUserId, item.itemId, item.quantity);
          break;
        case 'collectible':
          await this.transferCollectible(transaction, fromUserId, toUserId, item.itemId, item.quantity);
          break;
      }
    }
  }

  async transferCurrency(transaction, fromUserId, toUserId, currencyType, amount) {
    const fromUserRef = doc(db, 'userProfiles', fromUserId);
    const toUserRef = doc(db, 'userProfiles', toUserId);
    
    const fromUserSnap = await transaction.get(fromUserRef);
    const toUserSnap = await transaction.get(toUserRef);
    
    const fromUserData = fromUserSnap.data();
    const toUserData = toUserSnap.data();
    
    transaction.update(fromUserRef, {
      [currencyType]: (fromUserData[currencyType] || 0) - amount
    });
    
    transaction.update(toUserRef, {
      [currencyType]: (toUserData[currencyType] || 0) + amount
    });
  }

  async transferGear(transaction, fromUserId, toUserId, gearId, quantity) {
    // Implementation for gear transfer
  }

  async transferCollectible(transaction, fromUserId, toUserId, collectibleId, quantity) {
    // Implementation for collectible transfer
  }

  async releaseItemReservations(items) {
    for (const item of items) {
      if (item.reservationId) {
        const reservationQuery = query(
          collection(db, 'itemReservations'),
          where('reservationId', '==', item.reservationId)
        );
        
        const reservationSnapshot = await getDocs(reservationQuery);
        for (const doc of reservationSnapshot.docs) {
          await updateDoc(doc.ref, { status: 'released' });
        }
      }
    }
  }

  generateReservationId() {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async addToPublicMarket(tradeOffer) {
    const marketListing = {
      tradeOfferId: tradeOffer.id,
      type: 'trade_offer',
      offeredItems: tradeOffer.offeredItems,
      requestedItems: tradeOffer.requestedItems,
      createdAt: serverTimestamp(),
      estimatedValue: tradeOffer.features.estimatedValue,
      tags: this.generateMarketTags(tradeOffer)
    };

    await addDoc(collection(db, 'publicMarket'), marketListing);
  }

  generateMarketTags(tradeOffer) {
    const tags = [];
    
    tradeOffer.offeredItems.forEach(item => {
      tags.push(item.type, item.itemId);
      if (item.metadata?.rarity) tags.push(item.metadata.rarity);
    });
    
    tradeOffer.requestedItems.forEach(item => {
      tags.push(`wants_${item.type}`, `wants_${item.itemId}`);
    });
    
    return [...new Set(tags)]; // Remove duplicates
  }

  async validateGiftItems(fromUserId, items) {
    return await this.validateUserHasItems(fromUserId, items);
  }

  async deductItemsFromUser(userId, items) {
    const userRef = doc(db, 'userProfiles', userId);
    
    return await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const userData = userSnap.data();
      
      for (const item of items) {
        switch (item.type) {
          case 'currency':
            transaction.update(userRef, {
              [item.itemId]: (userData[item.itemId] || 0) - item.quantity
            });
            break;
          case 'gear':
            // Update gear inventory
            break;
          case 'collectible':
            // Update collectible inventory
            break;
        }
      }
    });
  }

  async addItemsToUser(transaction, userId, items) {
    const userRef = doc(db, 'userProfiles', userId);
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data();
    
    for (const item of items) {
      switch (item.type) {
        case 'currency':
          transaction.update(userRef, {
            [item.itemId]: (userData[item.itemId] || 0) + item.quantity
          });
          break;
        case 'gear':
          // Add gear to inventory
          break;
        case 'collectible':
          // Add collectible to inventory
          break;
      }
    }
  }

  selectGiftWrapping(occasion) {
    const wrappings = {
      birthday: { color: 'rainbow', pattern: 'confetti', ribbon: 'gold' },
      achievement: { color: 'gold', pattern: 'stars', ribbon: 'blue' },
      thanks: { color: 'warm', pattern: 'hearts', ribbon: 'red' },
      just_because: { color: 'surprise', pattern: 'random', ribbon: 'silver' }
    };
    
    return wrappings[occasion] || wrappings.just_because;
  }

  selectGiftAnimation(items) {
    if (items.some(item => item.metadata?.rarity === 'legendary')) {
      return 'legendary_reveal';
    } else if (items.length > 5) {
      return 'multiple_items_cascade';
    } else {
      return 'standard_unwrap';
    }
  }

  async estimateItemsValue(items) {
    let totalValue = 0;
    
    for (const item of items) {
      switch (item.type) {
        case 'currency':
          totalValue += item.itemId === 'hubbaBucks' ? item.quantity : item.quantity * 100;
          break;
        case 'gear':
          totalValue += item.metadata?.value || 50;
          break;
        case 'collectible':
          totalValue += item.metadata?.marketValue || 200;
          break;
      }
    }
    
    return totalValue;
  }

  async getUserRelationship(user1Id, user2Id) {
    // Determine relationship between users (friend, stranger, etc.)
    return 'friend'; // Simplified
  }

  async scheduleGiftDelivery(gift) {
    // Schedule delivery for later
    setTimeout(() => {
      this.deliverGift(gift.id);
    }, gift.scheduledFor.getTime() - Date.now());
  }

  async createThankYouPrompt(gift) {
    const prompt = {
      userId: gift.toUserId,
      type: 'thank_you_prompt',
      giftId: gift.id,
      fromUserId: gift.fromUserId,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };

    await addDoc(collection(db, 'socialPrompts'), prompt);
  }

  async getShopName(shopId) {
    const shopRef = doc(db, 'shops', shopId);
    const shopSnap = await getDoc(shopRef);
    return shopSnap.exists() ? shopSnap.data().name : 'Unknown Shop';
  }

  async getUserCreditScore(userId) {
    // Calculate credit score based on IOU history
    const iousQuery = query(
      collection(db, 'ious'),
      where('fromUserId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const iousSnapshot = await getDocs(iousQuery);
    const ious = iousSnapshot.docs.map(doc => doc.data());
    
    let score = 100; // Start with perfect score
    
    ious.forEach(iou => {
      if (iou.status === 'defaulted') score -= 20;
      if (iou.status === 'paid' && iou.lastPayment) score += 5;
    });
    
    return Math.max(0, Math.min(100, score));
  }

  async calculateIOUPayment(iou, amount) {
    const now = new Date();
    const dueDate = iou.dueDate ? iou.dueDate.toDate() : null;
    
    let interestAmount = 0;
    let feeAmount = 0;
    
    // Calculate interest if applicable
    if (iou.terms.interestRate > 0) {
      const timeElapsed = now.getTime() - iou.createdAt.toDate().getTime();
      const yearsFraction = timeElapsed / (365 * 24 * 60 * 60 * 1000);
      interestAmount = iou.remainingAmount * iou.terms.interestRate * yearsFraction;
    }
    
    // Calculate late fee if overdue
    if (dueDate && now > dueDate) {
      const gracePeriodEnd = new Date(dueDate.getTime() + iou.terms.gracePeriod);
      if (now > gracePeriodEnd) {
        feeAmount = iou.remainingAmount * iou.terms.lateFee;
      }
    }
    
    const totalOwed = iou.remainingAmount + interestAmount + feeAmount;
    const principalAmount = Math.min(amount, iou.remainingAmount);
    const totalAmount = Math.min(amount, totalOwed);
    
    return {
      principalAmount,
      interestAmount: Math.min(interestAmount, amount - principalAmount),
      feeAmount: Math.min(feeAmount, amount - principalAmount - interestAmount),
      totalAmount
    };
  }

  async scheduleIOUReminders(iou) {
    const reminders = [
      { days: 7, message: 'IOU payment due in 7 days' },
      { days: 1, message: 'IOU payment due tomorrow' },
      { days: 0, message: 'IOU payment is due today' }
    ];
    
    for (const reminder of reminders) {
      const reminderDate = new Date(iou.dueDate.getTime() - (reminder.days * 24 * 60 * 60 * 1000));
      
      setTimeout(() => {
        this.sendIOUReminder(iou, reminder.message);
      }, reminderDate.getTime() - Date.now());
    }
  }

  async transferHubbaBucks(transaction, fromUserId, toUserId, amount) {
    await this.transferCurrency(transaction, fromUserId, toUserId, 'hubbaBucks', amount);
  }

  // NOTIFICATION FUNCTIONS

  async notifyTradeOffer(userId, tradeOffer) {
    const notification = {
      userId,
      type: 'trade_offer',
      title: 'New Trade Offer! 🔄',
      message: `Someone wants to trade with you! Check out their offer.`,
      data: { tradeOfferId: tradeOffer.id },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async notifyGiftDelivery(gift) {
    const notification = {
      userId: gift.toUserId,
      type: 'gift_received',
      title: gift.isAnonymous ? 'Anonymous Gift! 🎁' : 'Gift Received! 🎁',
      message: gift.message || 'You have a special gift waiting for you!',
      data: { giftId: gift.id },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async notifyShopCredit(userId, shopCredit) {
    const notification = {
      userId,
      type: 'shop_credit',
      title: 'Shop Credit Added! 💳',
      message: `You received $${shopCredit.amount} credit at ${shopCredit.metadata.shopName}`,
      data: { creditId: shopCredit.id },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async notifyIOURequest(userId, iou) {
    const notification = {
      userId,
      type: 'iou_request',
      title: 'IOU Request 📝',
      message: `Someone is requesting an IOU for ${iou.amount} ${iou.currency}`,
      data: { iouId: iou.id },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async notifyIOUPayment(userId, iou, payment) {
    const notification = {
      userId,
      type: 'iou_payment',
      title: 'IOU Payment Received 💰',
      message: `Received ${payment.amount} ${iou.currency} payment. Remaining: ${payment.remainingAfter}`,
      data: { iouId: iou.id },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async sendIOUReminder(iou, message) {
    const notification = {
      userId: iou.fromUserId,
      type: 'iou_reminder',
      title: 'IOU Reminder 📅',
      message,
      data: { iouId: iou.id },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  cleanup() {
    this.activeMarkets.clear();
    this.tradingPairs.clear();
    this.shopCredits.clear();
    this.giftingQueue.clear();
  }
}

export default new IRLSocialEconomyService();
