import { shopService } from '../services/shopService';
import { currencyProgressionService } from '../services/currencyProgressionService';
import { avatarSystemService } from '../services/avatarSystemService';
import { collectibleTradingService } from '../services/collectibleTradingService';
import { analyticsService, EventCategory } from '../services/analytics';
import GlobalErrorHandler from '../services/errorHandler';

// UNIFIED BACKEND API FOR BETA FEATURES

export class BetaFeaturesAPI {
  
  // SHOP & CURRENCY OPERATIONS

  async purchaseItem(userId, itemId, quantity = 1, paymentMethod = 'hubba_bucks') {
    try {
      // 1. Validate user authentication
      if (!userId) {
        throw new Error('User authentication required');
      }

      // 2. Get current user balances
      const balances = await currencyProgressionService.getUserBalances(userId);
      
      // 3. Attempt purchase through shop service
      const purchaseResult = await shopService.attemptPurchase(
        userId, 
        itemId, 
        quantity, 
        paymentMethod
      );

      // 4. Log successful purchase
      analyticsService.logEvent('beta_item_purchased', {
        category: EventCategory.SHOP,
        user_id: userId,
        item_id: itemId,
        quantity,
        payment_method: paymentMethod,
        transaction_id: purchaseResult.transactionId
      });

      return {
        success: true,
        purchase: purchaseResult,
        newBalance: purchaseResult.remainingBalance
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'purchase_item',
        user_id: userId,
        item_id: itemId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUserShopData(userId) {
    try {
      // Get user balances
      const balances = await currencyProgressionService.getUserBalances(userId);
      
      // Get shop inventory
      const shopItems = await shopService.getShopItems();
      
      // Get user's purchase history
      const purchaseHistory = await shopService.getUserPurchaseHistory(userId);
      
      // Get featured items
      const featuredItems = await shopService.getFeaturedItems();
      
      return {
        success: true,
        data: {
          balances,
          shop: shopItems,
          featured: featuredItems,
          purchaseHistory: purchaseHistory.slice(0, 10) // Last 10 purchases
        }
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'get_shop_data',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // CURRENCY OPERATIONS

  async awardCurrency(userId, currencyType, amount, source, metadata = {}) {
    try {
      let result;
      
      if (currencyType === 'hubba_bucks') {
        result = await currencyProgressionService.awardHubbaBucks(
          userId, 
          amount, 
          source, 
          metadata
        );
      } else if (currencyType === 'xp') {
        result = await currencyProgressionService.awardXP(
          userId,
          amount,
          source,
          metadata
        );
      } else {
        throw new Error('Invalid currency type');
      }

      analyticsService.logEvent('beta_currency_awarded', {
        category: EventCategory.PROGRESSION,
        user_id: userId,
        currency_type: currencyType,
        amount,
        source,
        transaction_id: result.transactionId
      });

      return {
        success: true,
        result
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'award_currency',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUserProgression(userId) {
    try {
      const balances = await currencyProgressionService.getUserBalances(userId);
      
      // Calculate additional progression metrics
      const progressionData = {
        ...balances,
        nextLevelProgress: {
          current: balances.xp,
          required: currencyProgressionService.calculateXPRequired(balances.level + 1),
          percentage: Math.round((balances.xpToNextLevel / currencyProgressionService.calculateXPRequired(balances.level + 1)) * 100)
        },
        achievements: await this.getUserAchievements(userId),
        weeklyProgress: await this.getWeeklyProgress(userId)
      };

      return {
        success: true,
        progression: progressionData
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api', 
        action: 'get_user_progression',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // AVATAR SYSTEM

  async getFullAvatarData(userId) {
    try {
      // Get avatar configuration
      const avatar = await avatarSystemService.getUserAvatar(userId);
      
      // Get user inventory
      const inventory = await shopService.getUserInventory(userId);
      
      // Get avatar showcase
      const showcase = await avatarSystemService.getAvatarShowcase(userId);
      
      return {
        success: true,
        avatar: {
          configuration: avatar,
          inventory: inventory,
          showcase: showcase,
          availableSlots: ['feet', 'deck', 'wheels', 'trucks', 'top', 'bottom', 'outerwear', 'head', 'hands', 'misc']
        }
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'get_avatar_data',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async equipAvatarItem(userId, itemId, slot) {
    try {
      const result = await avatarSystemService.equipItem(userId, itemId, slot);
      
      analyticsService.logEvent('beta_avatar_item_equipped', {
        category: EventCategory.AVATAR,
        user_id: userId,
        item_id: itemId,
        slot: slot
      });

      return {
        success: true,
        result
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'equip_avatar_item',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateAvatarCustomization(userId, customizationType, data) {
    try {
      let result;
      
      if (customizationType === 'appearance') {
        result = await avatarSystemService.updateAvatarAppearance(userId, data);
      } else if (customizationType === 'poses') {
        result = await avatarSystemService.updateAvatarPoses(userId, data);
      } else {
        throw new Error('Invalid customization type');
      }

      analyticsService.logEvent('beta_avatar_customized', {
        category: EventCategory.AVATAR,
        user_id: userId,
        customization_type: customizationType
      });

      return {
        success: true,
        result
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'update_avatar_customization',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // TRADING SYSTEM

  async createTradeOffer(userId, tradeData) {
    try {
      // Validate trade data
      if (!tradeData.offeringItems || !tradeData.requestingItems) {
        throw new Error('Both offering and requesting items are required');
      }

      // Validate the trade offer
      await collectibleTradingService.validateTradeOffer(userId, tradeData);
      
      // Create the trade offer
      const result = await collectibleTradingService.createTradeOffer(userId, tradeData);
      
      analyticsService.logEvent('beta_trade_offer_created', {
        category: EventCategory.TRADING,
        user_id: userId,
        trade_id: result.tradeId,
        offer_value: result.tradeOffer.offerValue,
        is_public: tradeData.isPublic
      });

      return {
        success: true,
        trade: result
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'create_trade_offer',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async acceptTradeOffer(userId, tradeId) {
    try {
      const result = await collectibleTradingService.executeTradeTransaction(tradeId, userId);
      
      analyticsService.logEvent('beta_trade_completed', {
        category: EventCategory.TRADING,
        user_id: userId,
        trade_id: tradeId
      });

      return {
        success: true,
        trade: result
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'accept_trade_offer',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUserTrades(userId, filters = {}) {
    try {
      const { status = 'all', type = 'all', limit = 20 } = filters;
      
      // Get user's trade offers (both sent and received)
      const sentTrades = await collectibleTradingService.getUserTradeOffers(userId, 'sent');
      const receivedTrades = await collectibleTradingService.getUserTradeOffers(userId, 'received');
      const completedTrades = await collectibleTradingService.getUserCompletedTrades(userId);
      
      let allTrades = [];
      
      if (type === 'all' || type === 'sent') {
        allTrades.push(...sentTrades.map(t => ({ ...t, type: 'sent' })));
      }
      
      if (type === 'all' || type === 'received') {
        allTrades.push(...receivedTrades.map(t => ({ ...t, type: 'received' })));
      }
      
      if (type === 'all' || type === 'completed') {
        allTrades.push(...completedTrades.map(t => ({ ...t, type: 'completed' })));
      }

      // Apply status filter
      if (status !== 'all') {
        allTrades = allTrades.filter(trade => trade.status === status);
      }

      // Sort by most recent and apply limit
      allTrades.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      allTrades = allTrades.slice(0, limit);

      return {
        success: true,
        trades: allTrades,
        summary: {
          totalSent: sentTrades.length,
          totalReceived: receivedTrades.length,
          totalCompleted: completedTrades.length
        }
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'get_user_trades',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // INTEGRATED FEATURES

  async getUserDashboard(userId) {
    try {
      // Get all user data in parallel
      const [
        progression,
        avatar,
        shopData,
        recentTrades
      ] = await Promise.all([
        this.getUserProgression(userId),
        this.getFullAvatarData(userId),
        this.getUserShopData(userId),
        this.getUserTrades(userId, { limit: 5 })
      ]);

      return {
        success: true,
        dashboard: {
          user_id: userId,
          progression: progression.success ? progression.progression : null,
          avatar: avatar.success ? avatar.avatar : null,
          shop: shopData.success ? shopData.data : null,
          recent_trades: recentTrades.success ? recentTrades.trades : [],
          last_updated: new Date()
        }
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'beta_api',
        action: 'get_user_dashboard',
        user_id: userId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async validateUserAction(userId, action, data = {}) {
    try {
      // Common validation for all beta features
      
      // 1. Rate limiting
      const recentActions = await this.getRecentUserActions(userId, 60000); // 1 minute
      if (recentActions.length > 30) {
        throw new Error('Rate limit exceeded. Please slow down.');
      }

      // 2. Account status check
      const userStatus = await this.getUserStatus(userId);
      if (userStatus.suspended) {
        throw new Error('Account is temporarily suspended');
      }

      // 3. Feature-specific validation
      switch (action) {
        case 'purchase':
          if (data.amount > 10000) { // Max 10k Hubba Bucks per purchase
            throw new Error('Purchase amount exceeds maximum allowed');
          }
          break;
          
        case 'trade':
          if (userStatus.tradingRestricted) {
            throw new Error('Trading is temporarily restricted on your account');
          }
          break;
          
        case 'currency_award':
          // Only allow from verified sources
          const validSources = ['trick_completion', 'session_end', 'challenge_win', 'daily_login'];
          if (!validSources.includes(data.source)) {
            throw new Error('Invalid currency source');
          }
          break;
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // HELPER METHODS

  async getUserAchievements(userId) {
    // Placeholder for achievement system
    return {
      total: 0,
      recent: [],
      categories: {
        skating: 0,
        trading: 0,
        collecting: 0,
        social: 0
      }
    };
  }

  async getWeeklyProgress(userId) {
    // Placeholder for weekly progress tracking
    return {
      xp_earned: 0,
      hubba_bucks_earned: 0,
      items_purchased: 0,
      trades_completed: 0,
      goals_met: 0
    };
  }

  async getRecentUserActions(userId, timeWindowMs) {
    // Placeholder for rate limiting
    return [];
  }

  async getUserStatus(userId) {
    // Placeholder for user status checking
    return {
      suspended: false,
      tradingRestricted: false,
      lastActive: new Date()
    };
  }
}

export const betaFeaturesAPI = new BetaFeaturesAPI();
export default BetaFeaturesAPI;
