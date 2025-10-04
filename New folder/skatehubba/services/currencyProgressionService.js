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
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  runTransaction
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class CurrencyProgressionService {
  constructor() {
    this.userBalances = new Map();
    this.rewardTables = new Map();
    this.shopInventory = new Map();
    this.transactionHistory = new Map();
    this.streakData = new Map();
    this.antiCheatFlags = new Map();
  }

  // I. DUAL CURRENCY MODEL

  // A. Hubba Bucks (Premium Currency)
  async addHubbaBucks(userId, amount, source, metadata = {}) {
    try {
      // Server-side validation and anti-cheat
      const isValidTransaction = await this.validateTransaction(userId, 'hubba_bucks', amount, source);
      
      if (!isValidTransaction) {
        throw new Error('Transaction validation failed');
      }

      const transaction = {
        userId,
        type: 'earn',
        currency: 'hubba_bucks',
        amount,
        source, // 'iap', 'referral', 'leaderboard', 'event', 'admin'
        metadata,
        timestamp: new Date(),
        transactionId: this.generateTransactionId()
      };

      // Log transaction
      await addDoc(collection(db, 'currencyTransactions'), transaction);

      // Update user balance
      const userRef = doc(db, 'userProfiles', userId);
      await updateDoc(userRef, {
        hubbaBucks: increment(amount),
        totalHubbaBucksEarned: increment(amount),
        lastCurrencyUpdate: new Date()
      });

      // Analytics
      analyticsService.logEvent('hubba_bucks_earned', {
        category: EventCategory.ECONOMY,
        user_id: userId,
        amount: amount,
        source: source,
        transaction_id: transaction.transactionId
      });

      // Positive feedback notification
      await this.sendCurrencyNotification(userId, 'hubba_bucks', amount, 'earned');

      return transaction;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'add_hubba_bucks',
        user_id: userId,
        amount: amount
      });
      throw new Error('Failed to add Hubba Bucks');
    }
  }

  async spendHubbaBucks(userId, amount, itemId, source = 'shop') {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (userProfile.hubbaBucks < amount) {
        throw new Error('Insufficient Hubba Bucks');
      }

      const transaction = {
        userId,
        type: 'spend',
        currency: 'hubba_bucks',
        amount: -amount,
        source,
        itemId,
        timestamp: new Date(),
        transactionId: this.generateTransactionId()
      };

      // Log transaction
      await addDoc(collection(db, 'currencyTransactions'), transaction);

      // Update user balance
      const userRef = doc(db, 'userProfiles', userId);
      await updateDoc(userRef, {
        hubbaBucks: increment(-amount),
        totalHubbaBucksSpent: increment(amount),
        lastCurrencyUpdate: new Date()
      });

      analyticsService.logEvent('hubba_bucks_spent', {
        category: EventCategory.ECONOMY,
        user_id: userId,
        amount: amount,
        item_id: itemId,
        source: source
      });

      return transaction;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'spend_hubba_bucks'
      });
      throw error;
    }
  }

  // B. XP Points (Progression Currency)
  async addXP(userId, amount, source, metadata = {}) {
    try {
      const isValidTransaction = await this.validateTransaction(userId, 'xp', amount, source);
      
      if (!isValidTransaction) {
        throw new Error('XP transaction validation failed');
      }

      const transaction = {
        userId,
        type: 'earn',
        currency: 'xp',
        amount,
        source, // 'challenge', 'checkin', 'session', 'streak', 'social', 'daily_login'
        metadata,
        timestamp: new Date(),
        transactionId: this.generateTransactionId()
      };

      await addDoc(collection(db, 'currencyTransactions'), transaction);

      const userRef = doc(db, 'userProfiles', userId);
      const userProfile = await this.getUserProfile(userId);
      
      const newXP = userProfile.xp + amount;
      const oldLevel = this.calculateLevel(userProfile.xp);
      const newLevel = this.calculateLevel(newXP);

      // Update XP
      await updateDoc(userRef, {
        xp: newXP,
        totalXPEarned: increment(amount),
        lastCurrencyUpdate: new Date()
      });

      // Check for level up
      if (newLevel > oldLevel) {
        await this.handleLevelUp(userId, oldLevel, newLevel);
      }

      analyticsService.logEvent('xp_earned', {
        category: EventCategory.PROGRESSION,
        user_id: userId,
        amount: amount,
        source: source,
        old_level: oldLevel,
        new_level: newLevel
      });

      await this.sendCurrencyNotification(userId, 'xp', amount, 'earned');

      return { transaction, leveledUp: newLevel > oldLevel, newLevel };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'add_xp'
      });
      throw new Error('Failed to add XP');
    }
  }

  async spendXP(userId, amount, itemId, source = 'shop') {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (userProfile.xp < amount) {
        throw new Error('Insufficient XP');
      }

      const transaction = {
        userId,
        type: 'spend',
        currency: 'xp',
        amount: -amount,
        source,
        itemId,
        timestamp: new Date(),
        transactionId: this.generateTransactionId()
      };

      await addDoc(collection(db, 'currencyTransactions'), transaction);

      const userRef = doc(db, 'userProfiles', userId);
      await updateDoc(userRef, {
        xp: increment(-amount),
        totalXPSpent: increment(amount),
        lastCurrencyUpdate: new Date()
      });

      analyticsService.logEvent('xp_spent', {
        category: EventCategory.PROGRESSION,
        user_id: userId,
        amount: amount,
        item_id: itemId,
        source: source
      });

      return transaction;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'spend_xp'
      });
      throw error;
    }
  }

  // II. SHOP & REWARDS SYSTEM

  async getShopItems(category = 'all', currency = 'all') {
    try {
      let q = collection(db, 'shopItems');
      
      if (category !== 'all') {
        q = query(q, where('category', '==', category));
      }
      
      q = query(q, where('isActive', '==', true));

      const snapshot = await getDocs(q);
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter by currency if specified
      if (currency !== 'all') {
        items = items.filter(item => 
          item.currencies.includes(currency) || 
          item.currencies.includes('both')
        );
      }

      // Add availability status
      items = items.map(item => ({
        ...item,
        availability: this.checkItemAvailability(item)
      }));

      return items;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'get_shop_items'
      });
      return [];
    }
  }

  async purchaseShopItem(userId, itemId, currency) {
    try {
      const item = await this.getShopItem(itemId);
      const userProfile = await this.getUserProfile(userId);
      
      if (!item || !item.isActive) {
        throw new Error('Item not available');
      }

      // Check if item is purchasable with specified currency
      if (!item.currencies.includes(currency) && !item.currencies.includes('both')) {
        throw new Error(`Item cannot be purchased with ${currency}`);
      }

      // Check price and balance
      const price = item.prices[currency];
      if (!price) {
        throw new Error('Price not available for this currency');
      }

      const userBalance = currency === 'hubba_bucks' ? userProfile.hubbaBucks : userProfile.xp;
      if (userBalance < price) {
        throw new Error(`Insufficient ${currency}`);
      }

      // Check stock for limited items
      if (item.isLimited && item.stock <= 0) {
        throw new Error('Item out of stock');
      }

      // Check if user already owns item (for non-consumables)
      if (!item.isConsumable && userProfile.ownedItems?.includes(itemId)) {
        throw new Error('Item already owned');
      }

      // Process purchase
      if (currency === 'hubba_bucks') {
        await this.spendHubbaBucks(userId, price, itemId, 'shop');
      } else {
        await this.spendXP(userId, price, itemId, 'shop');
      }

      // Add item to user's inventory
      await this.addItemToUserInventory(userId, itemId, item);

      // Update item stock if limited
      if (item.isLimited) {
        const itemRef = doc(db, 'shopItems', itemId);
        await updateDoc(itemRef, {
          stock: increment(-1),
          totalSold: increment(1)
        });
      }

      // Create purchase record
      const purchase = {
        userId,
        itemId,
        currency,
        price,
        purchasedAt: new Date(),
        transactionId: this.generateTransactionId()
      };

      await addDoc(collection(db, 'purchases'), purchase);

      analyticsService.logEvent('item_purchased', {
        category: EventCategory.ECONOMY,
        user_id: userId,
        item_id: itemId,
        currency: currency,
        price: price,
        item_category: item.category
      });

      await this.sendPurchaseNotification(userId, item, currency, price);

      return purchase;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'purchase_shop_item'
      });
      throw error;
    }
  }

  // III. PROGRESSION, GATING & INCENTIVES

  calculateLevel(xp) {
    // Progressive XP curve: level 1 = 100 XP, level 2 = 250 XP, etc.
    if (xp < 100) return 1;
    
    let level = 1;
    let totalXPNeeded = 0;
    
    while (totalXPNeeded <= xp) {
      const xpForNextLevel = 100 + (level - 1) * 50; // Increasing XP requirement
      totalXPNeeded += xpForNextLevel;
      if (totalXPNeeded <= xp) {
        level++;
      }
    }
    
    return level;
  }

  getXPForLevel(level) {
    if (level <= 1) return 0;
    
    let totalXP = 0;
    for (let i = 1; i < level; i++) {
      totalXP += 100 + (i - 1) * 50;
    }
    return totalXP;
  }

  getXPToNextLevel(currentXP) {
    const currentLevel = this.calculateLevel(currentXP);
    const nextLevelXP = this.getXPForLevel(currentLevel + 1);
    return nextLevelXP - currentXP;
  }

  async handleLevelUp(userId, oldLevel, newLevel) {
    try {
      const levelUpRewards = await this.getLevelUpRewards(newLevel);
      
      // Award level up rewards
      for (const reward of levelUpRewards) {
        switch (reward.type) {
          case 'hubba_bucks':
            await this.addHubbaBucks(userId, reward.amount, 'level_up', { level: newLevel });
            break;
          case 'xp':
            await this.addXP(userId, reward.amount, 'level_up_bonus', { level: newLevel });
            break;
          case 'item':
            await this.addItemToUserInventory(userId, reward.itemId, reward.item);
            break;
          case 'unlock':
            await this.unlockFeature(userId, reward.featureId);
            break;
        }
      }

      // Update user level
      const userRef = doc(db, 'userProfiles', userId);
      await updateDoc(userRef, {
        level: newLevel,
        levelUpAt: new Date()
      });

      // Send level up notification
      await this.sendLevelUpNotification(userId, newLevel, levelUpRewards);

      analyticsService.logEvent('level_up', {
        category: EventCategory.PROGRESSION,
        user_id: userId,
        old_level: oldLevel,
        new_level: newLevel,
        rewards_count: levelUpRewards.length
      });

      return levelUpRewards;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'handle_level_up'
      });
      return [];
    }
  }

  async getLevelUpRewards(level) {
    const rewardTables = {
      5: [{ type: 'hubba_bucks', amount: 50 }, { type: 'item', itemId: 'avatar_basic_1' }],
      10: [{ type: 'hubba_bucks', amount: 100 }, { type: 'unlock', featureId: 'custom_avatar' }],
      15: [{ type: 'hubba_bucks', amount: 150 }, { type: 'item', itemId: 'deck_rare_1' }],
      20: [{ type: 'hubba_bucks', amount: 200 }, { type: 'unlock', featureId: 'crew_creation' }],
      25: [{ type: 'hubba_bucks', amount: 300 }, { type: 'item', itemId: 'avatar_legendary_1' }]
    };

    return rewardTables[level] || [];
  }

  // IV. STREAKS & ACHIEVEMENTS

  async updateDailyStreak(userId) {
    try {
      const userRef = doc(db, 'userProfiles', userId);
      const userProfile = await this.getUserProfile(userId);
      
      const today = new Date().toDateString();
      const lastLogin = userProfile.lastLoginDate ? new Date(userProfile.lastLoginDate).toDateString() : null;
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

      let newStreak = 1;
      let streakBroken = false;

      if (lastLogin === today) {
        // Already logged in today, no change
        return userProfile.dailyStreak || 0;
      }

      if (lastLogin === yesterday) {
        // Continuing streak
        newStreak = (userProfile.dailyStreak || 0) + 1;
      } else if (lastLogin && lastLogin !== yesterday) {
        // Streak broken
        streakBroken = true;
        newStreak = 1;
      }

      // Update streak
      await updateDoc(userRef, {
        dailyStreak: newStreak,
        lastLoginDate: new Date(),
        longestStreak: Math.max(newStreak, userProfile.longestStreak || 0)
      });

      // Award streak rewards
      const streakRewards = await this.getStreakRewards(newStreak);
      for (const reward of streakRewards) {
        if (reward.type === 'xp') {
          await this.addXP(userId, reward.amount, 'daily_streak', { streak: newStreak });
        } else if (reward.type === 'hubba_bucks') {
          await this.addHubbaBucks(userId, reward.amount, 'daily_streak', { streak: newStreak });
        }
      }

      analyticsService.logEvent('daily_streak_updated', {
        category: EventCategory.PROGRESSION,
        user_id: userId,
        new_streak: newStreak,
        streak_broken: streakBroken,
        rewards_earned: streakRewards.length
      });

      if (streakRewards.length > 0) {
        await this.sendStreakNotification(userId, newStreak, streakRewards);
      }

      return newStreak;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'update_daily_streak'
      });
      return 0;
    }
  }

  getStreakRewards(streak) {
    const rewards = [];
    
    // Daily XP bonus
    rewards.push({ type: 'xp', amount: 50 + (streak * 10) });
    
    // Weekly milestones
    if (streak % 7 === 0) {
      rewards.push({ type: 'hubba_bucks', amount: Math.floor(streak / 7) * 25 });
    }
    
    // Special milestones
    const specialMilestones = {
      30: { type: 'hubba_bucks', amount: 500 },
      60: { type: 'hubba_bucks', amount: 1000 },
      100: { type: 'hubba_bucks', amount: 2000 }
    };
    
    if (specialMilestones[streak]) {
      rewards.push(specialMilestones[streak]);
    }
    
    return rewards;
  }

  // V. MONETIZATION - IN-APP PURCHASES

  async createIAPPack(packData) {
    try {
      const pack = {
        name: packData.name,
        description: packData.description,
        sku: packData.sku, // App Store/Google Play SKU
        realPrice: packData.realPrice, // USD cents
        hubbaBucksAmount: packData.hubbaBucksAmount,
        bonusPercentage: packData.bonusPercentage || 0,
        totalHubbaBucks: Math.floor(packData.hubbaBucksAmount * (1 + packData.bonusPercentage / 100)),
        isPopular: packData.isPopular || false,
        isLimited: packData.isLimited || false,
        availableUntil: packData.availableUntil,
        category: packData.category || 'standard',
        displayOrder: packData.displayOrder || 0,
        isActive: true,
        createdAt: new Date()
      };

      const packRef = await addDoc(collection(db, 'iapPacks'), pack);
      return { id: packRef.id, ...pack };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'create_iap_pack'
      });
      throw new Error('Failed to create IAP pack');
    }
  }

  async processIAPPurchase(userId, packId, receiptData) {
    try {
      // Verify receipt with App Store/Google Play
      const verificationResult = await this.verifyIAPReceipt(receiptData);
      
      if (!verificationResult.isValid) {
        throw new Error('Invalid purchase receipt');
      }

      const pack = await this.getIAPPack(packId);
      if (!pack) {
        throw new Error('IAP pack not found');
      }

      // Award Hubba Bucks
      await this.addHubbaBucks(userId, pack.totalHubbaBucks, 'iap', {
        pack_id: packId,
        receipt_id: verificationResult.receiptId,
        real_price: pack.realPrice
      });

      // Record purchase
      const purchase = {
        userId,
        packId,
        hubbaBucksAwarded: pack.totalHubbaBucks,
        realPrice: pack.realPrice,
        receiptData: verificationResult.receiptId,
        platform: receiptData.platform,
        purchasedAt: new Date(),
        transactionId: this.generateTransactionId()
      };

      await addDoc(collection(db, 'iapPurchases'), purchase);

      analyticsService.logEvent('iap_purchase_completed', {
        category: EventCategory.MONETIZATION,
        user_id: userId,
        pack_id: packId,
        hubba_bucks_amount: pack.totalHubbaBucks,
        real_price: pack.realPrice,
        platform: receiptData.platform
      });

      return purchase;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'process_iap_purchase'
      });
      throw error;
    }
  }

  // BACKEND VALIDATION & SECURITY

  async validateTransaction(userId, currency, amount, source, metadata = {}) {
    try {
      // 1. Basic validation
      if (amount <= 0) return false;
      if (!['hubba_bucks', 'xp'].includes(currency)) return false;
      
      // 2. Source validation
      const validSources = {
        hubba_bucks: ['iap', 'referral', 'leaderboard', 'event', 'admin', 'quest_reward'],
        xp: ['trick_completion', 'session_end', 'challenge_win', 'daily_login', 'social_action']
      };
      
      if (!validSources[currency].includes(source)) return false;

      // 3. Rate limiting checks
      const recentTransactions = await this.getRecentTransactions(userId, currency, 300000); // 5 minutes
      
      // Maximum transactions per 5 minutes
      const maxTransactions = currency === 'hubba_bucks' ? 10 : 50;
      if (recentTransactions.length >= maxTransactions) {
        this.flagSuspiciousActivity(userId, 'rate_limit_exceeded', { currency, count: recentTransactions.length });
        return false;
      }

      // 4. Amount validation by source
      const maxAmounts = {
        hubba_bucks: {
          trick_completion: 25,
          session_end: 100,
          challenge_win: 200,
          daily_login: 50,
          quest_reward: 500
        },
        xp: {
          trick_completion: 50,
          session_end: 200,
          challenge_win: 500,
          daily_login: 100,
          social_action: 25
        }
      };

      if (maxAmounts[currency][source] && amount > maxAmounts[currency][source]) {
        this.flagSuspiciousActivity(userId, 'amount_exceeded', { currency, source, amount, max: maxAmounts[currency][source] });
        return false;
      }

      // 5. Metadata validation
      if (source === 'trick_completion' && !metadata.trickType) return false;
      if (source === 'session_end' && !metadata.sessionId) return false;
      if (source === 'challenge_win' && !metadata.challengeId) return false;

      // 6. Anti-duplicate check
      const duplicateCheck = await this.checkForDuplicate(userId, currency, source, metadata);
      if (duplicateCheck) {
        this.flagSuspiciousActivity(userId, 'duplicate_transaction', metadata);
        return false;
      }

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_validation',
        action: 'validate_transaction',
        user_id: userId
      });
      return false;
    }
  }

  async getRecentTransactions(userId, currency, timeWindowMs) {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const q = query(
      collection(db, 'currencyTransactions'),
      where('userId', '==', userId),
      where('currency', '==', currency),
      where('timestamp', '>=', cutoff)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  async checkForDuplicate(userId, currency, source, metadata) {
    if (source === 'session_end' && metadata.sessionId) {
      const q = query(
        collection(db, 'currencyTransactions'),
        where('userId', '==', userId),
        where('source', '==', source),
        where('metadata.sessionId', '==', metadata.sessionId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.length > 0;
    }

    if (source === 'challenge_win' && metadata.challengeId) {
      const q = query(
        collection(db, 'currencyTransactions'),
        where('userId', '==', userId),
        where('source', '==', source),
        where('metadata.challengeId', '==', metadata.challengeId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.length > 0;
    }

    return false;
  }

  flagSuspiciousActivity(userId, flagType, details) {
    const flag = {
      userId,
      flagType,
      details,
      timestamp: new Date(),
      severity: this.getSeverityLevel(flagType)
    };

    this.antiCheatFlags.set(`${userId}_${flagType}_${Date.now()}`, flag);
    
    // Store in database for admin review
    addDoc(collection(db, 'antiCheatFlags'), flag);

    analyticsService.logEvent('suspicious_activity_flagged', {
      category: EventCategory.SECURITY,
      user_id: userId,
      flag_type: flagType,
      severity: flag.severity
    });
  }

  getSeverityLevel(flagType) {
    const severityMap = {
      rate_limit_exceeded: 'medium',
      amount_exceeded: 'high',
      duplicate_transaction: 'high',
      suspicious_pattern: 'medium'
    };
    return severityMap[flagType] || 'low';
  }

  // SECURE CURRENCY OPERATIONS

  async awardHubbaBucks(userId, amount, source, metadata = {}) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Validate transaction
        const isValid = await this.validateTransaction(userId, 'hubba_bucks', amount, source, metadata);
        if (!isValid) {
          throw new Error('Transaction validation failed');
        }

        // Get current user data
        const userDoc = await transaction.get(doc(db, 'users', userId));
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        const currentBalance = userData.currency?.hubba_bucks || 0;
        const newBalance = currentBalance + amount;

        // Update user balance
        transaction.update(doc(db, 'users', userId), {
          'currency.hubba_bucks': newBalance,
          'stats.totalEarned': increment(amount),
          'lastActivity': serverTimestamp()
        });

        // Record transaction
        const transactionRecord = {
          userId,
          type: 'earn',
          currency: 'hubba_bucks',
          amount,
          source,
          metadata,
          timestamp: serverTimestamp(),
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionId: `hb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        transaction.set(doc(collection(db, 'currencyTransactions')), transactionRecord);

        return {
          success: true,
          newBalance,
          transactionId: transactionRecord.transactionId
        };
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'award_hubba_bucks',
        user_id: userId
      });
      throw error;
    }
  }

  async awardXP(userId, amount, source, metadata = {}) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Validate transaction
        const isValid = await this.validateTransaction(userId, 'xp', amount, source, metadata);
        if (!isValid) {
          throw new Error('XP transaction validation failed');
        }

        // Get current user data
        const userDoc = await transaction.get(doc(db, 'users', userId));
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        const currentXP = userData.progression?.xp || 0;
        const currentLevel = userData.progression?.level || 1;
        
        const newXP = currentXP + amount;
        const newLevel = this.calculateLevel(newXP);
        const leveledUp = newLevel > currentLevel;

        // Update user progression
        transaction.update(doc(db, 'users', userId), {
          'progression.xp': newXP,
          'progression.level': newLevel,
          'stats.totalXP': increment(amount),
          'lastActivity': serverTimestamp()
        });

        // Record XP transaction
        const xpRecord = {
          userId,
          type: 'earn',
          currency: 'xp',
          amount,
          source,
          metadata,
          timestamp: serverTimestamp(),
          xpBefore: currentXP,
          xpAfter: newXP,
          levelBefore: currentLevel,
          levelAfter: newLevel,
          leveledUp,
          transactionId: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        transaction.set(doc(collection(db, 'xpTransactions')), xpRecord);

        // Award level-up rewards if applicable
        if (leveledUp) {
          const levelRewards = this.getLevelUpRewards(newLevel);
          if (levelRewards.hubba_bucks > 0) {
            transaction.update(doc(db, 'users', userId), {
              'currency.hubba_bucks': increment(levelRewards.hubba_bucks)
            });
          }
        }

        return {
          success: true,
          newXP,
          newLevel,
          leveledUp,
          levelUpRewards: leveledUp ? this.getLevelUpRewards(newLevel) : null,
          transactionId: xpRecord.transactionId
        };
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'award_xp',
        user_id: userId
      });
      throw error;
    }
  }

  // SECURE SPENDING

  async spendHubbaBucks(userId, amount, purpose, metadata = {}) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Get current user data
        const userDoc = await transaction.get(doc(db, 'users', userId));
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        const currentBalance = userData.currency?.hubba_bucks || 0;

        // Validate sufficient funds
        if (currentBalance < amount) {
          throw new Error(`Insufficient Hubba Bucks. Need ${amount}, have ${currentBalance}`);
        }

        // Anti-cheat: Check for unusual spending patterns
        const recentSpending = await this.getRecentSpending(userId, 600000); // 10 minutes
        const totalRecentSpending = recentSpending.reduce((sum, t) => sum + t.amount, 0);
        
        if (totalRecentSpending + amount > currentBalance * 2) {
          this.flagSuspiciousActivity(userId, 'unusual_spending_pattern', {
            currentSpend: amount,
            recentSpending: totalRecentSpending,
            balance: currentBalance
          });
          throw new Error('Spending pattern flagged for review');
        }

        const newBalance = currentBalance - amount;

        // Update user balance
        transaction.update(doc(db, 'users', userId), {
          'currency.hubba_bucks': newBalance,
          'stats.totalSpent': increment(amount),
          'lastActivity': serverTimestamp()
        });

        // Record transaction
        const spendRecord = {
          userId,
          type: 'spend',
          currency: 'hubba_bucks',
          amount,
          purpose,
          metadata,
          timestamp: serverTimestamp(),
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionId: `spend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        transaction.set(doc(collection(db, 'currencyTransactions')), spendRecord);

        return {
          success: true,
          newBalance,
          transactionId: spendRecord.transactionId
        };
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'spend_hubba_bucks',
        user_id: userId
      });
      throw error;
    }
  }

  async getRecentSpending(userId, timeWindowMs) {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const q = query(
      collection(db, 'currencyTransactions'),
      where('userId', '==', userId),
      where('type', '==', 'spend'),
      where('timestamp', '>=', cutoff)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  // LEVEL CALCULATION & REWARDS

  calculateLevel(xp) {
    // Progressive XP requirement: Level 1 = 0, Level 2 = 100, Level 3 = 250, etc.
    if (xp < 100) return 1;
    
    // Quadratic growth: level = floor(sqrt(xp/25))
    return Math.floor(Math.sqrt(xp / 25)) + 1;
  }

  calculateXPRequired(level) {
    if (level <= 1) return 0;
    return Math.pow(level - 1, 2) * 25;
  }

  calculateXPToNextLevel(currentXP) {
    const currentLevel = this.calculateLevel(currentXP);
    const nextLevel = currentLevel + 1;
    const xpForNextLevel = this.calculateXPRequired(nextLevel);
    return xpForNextLevel - currentXP;
  }

  getLevelUpRewards(level) {
    const baseReward = 50; // Base Hubba Bucks reward
    const multiplier = Math.floor(level / 5) + 1; // Bonus every 5 levels
    
    return {
      hubba_bucks: baseReward * multiplier,
      title: level % 10 === 0 ? `Level ${level} Master` : null,
      badge: level % 25 === 0 ? `Milestone ${level}` : null
    };
  }

  // BALANCE CHECKING

  async getUserBalances(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();
      return {
        hubba_bucks: userData.currency?.hubba_bucks || 0,
        xp: userData.progression?.xp || 0,
        level: userData.progression?.level || 1,
        xpToNextLevel: this.calculateXPToNextLevel(userData.progression?.xp || 0),
        lastUpdated: userData.lastActivity?.toDate()
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'get_user_balances',
        user_id: userId
      });
      throw error;
    }
  }

  // VII. FEEDBACK & UX

  async sendCurrencyNotification(userId, currency, amount, action) {
    try {
      const notification = {
        userId,
        type: 'currency_update',
        title: action === 'earned' ? `+${amount} ${currency.toUpperCase()}!` : `${currency.toUpperCase()} Spent`,
        message: this.getCurrencyMessage(currency, amount, action),
        icon: currency === 'hubba_bucks' ? '💰' : '⭐',
        timestamp: new Date(),
        read: false,
        category: 'economy'
      };

      await addDoc(collection(db, 'notifications'), notification);
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'send_currency_notification'
      });
    }
  }

  async sendLevelUpNotification(userId, newLevel, rewards) {
    try {
      const notification = {
        userId,
        type: 'level_up',
        title: `🎉 Level Up! You're now level ${newLevel}!`,
        message: `Awesome progress! You've unlocked ${rewards.length} rewards.`,
        icon: '🆙',
        timestamp: new Date(),
        read: false,
        category: 'progression',
        metadata: { level: newLevel, rewards }
      };

      await addDoc(collection(db, 'notifications'), notification);
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'send_level_up_notification'
      });
    }
  }

  // Utility Functions
  generateTransactionId() {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getUserProfile(userId) {
    try {
      const userRef = doc(db, 'userProfiles', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        // Create default profile
        const defaultProfile = {
          userId,
          hubbaBucks: 0,
          xp: 0,
          level: 1,
          dailyStreak: 0,
          longestStreak: 0,
          totalHubbaBucksEarned: 0,
          totalHubbaBucksSpent: 0,
          totalXPEarned: 0,
          totalXPSpent: 0,
          ownedItems: [],
          unlockedFeatures: [],
          createdAt: new Date(),
          lastLoginDate: new Date()
        };
        
        await updateDoc(userRef, defaultProfile);
        return defaultProfile;
      }
      
      return { id: userSnap.id, ...userSnap.data() };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'currency_progression',
        action: 'get_user_profile'
      });
      return {};
    }
  }

  getCurrencyMessage(currency, amount, action) {
    if (action === 'earned') {
      return currency === 'hubba_bucks' 
        ? `You earned ${amount} Hubba Bucks! Use them in the shop for exclusive items.`
        : `You gained ${amount} XP! Keep progressing to unlock more rewards.`;
    } else {
      return currency === 'hubba_bucks'
        ? `You spent ${amount} Hubba Bucks on an exclusive item!`
        : `You used ${amount} XP to unlock something awesome!`;
    }
  }

  getMaxAllowedAmount(currency, source) {
    const limits = {
      hubba_bucks: {
        iap: 10000,
        referral: 100,
        leaderboard: 500,
        event: 1000,
        admin: 50000
      },
      xp: {
        challenge: 500,
        checkin: 100,
        session: 300,
        streak: 200,
        social: 150,
        daily_login: 100
      }
    };

    return limits[currency]?.[source] || 0;
  }

  getValidSources(currency) {
    const sources = {
      hubba_bucks: ['iap', 'referral', 'leaderboard', 'event', 'admin', 'level_up'],
      xp: ['challenge', 'checkin', 'session', 'streak', 'social', 'daily_login', 'level_up_bonus']
    };

    return sources[currency] || [];
  }

  checkItemAvailability(item) {
    const now = new Date();
    
    if (!item.isActive) return 'inactive';
    if (item.isLimited && item.stock <= 0) return 'out_of_stock';
    if (item.availableUntil && new Date(item.availableUntil) < now) return 'expired';
    if (item.isLimited && item.stock <= 10) return 'low_stock';
    
    return 'available';
  }

  async verifyIAPReceipt(receiptData) {
    // Mock implementation - in real app, verify with App Store/Google Play
    return {
      isValid: true,
      receiptId: `receipt_${Date.now()}`,
      platform: receiptData.platform
    };
  }
}

export default new CurrencyProgressionService();
