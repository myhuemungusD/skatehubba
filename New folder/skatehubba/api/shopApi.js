import { db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { shopService } from '../services/shopService';
import { currencyProgressionService } from '../services/currencyProgressionService';
import { betaFeaturesAPI } from './betaFeaturesApi';
import { analyticsService, EventCategory } from '../services/analytics';
import GlobalErrorHandler from '../services/errorHandler';

// LEGACY SHOP API (maintained for compatibility)
export async function getShops() {
  const querySnapshot = await getDocs(collection(db, 'shops'));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ENHANCED SHOP API FOR BETA FEATURES

export async function getShopInventory(filters = {}) {
  try {
    const inventory = await shopService.getShopItems(filters);
    
    analyticsService.logEvent('shop_inventory_viewed', {
      category: EventCategory.SHOP,
      filters: JSON.stringify(filters)
    });

    return {
      success: true,
      ...inventory
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_inventory'
    });
    
    return {
      success: false,
      error: error.message,
      items: [],
      totalCount: 0
    };
  }
}

export async function getUserShopData(userId) {
  try {
    return await betaFeaturesAPI.getUserShopData(userId);
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_user_shop_data',
      user_id: userId
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

export async function purchaseShopItem(userId, itemId, quantity = 1, paymentMethod = 'hubba_bucks') {
  try {
    // Validate user action
    const validation = await betaFeaturesAPI.validateUserAction(userId, 'purchase', {
      item_id: itemId,
      quantity,
      payment_method: paymentMethod
    });

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Execute purchase
    return await betaFeaturesAPI.purchaseItem(userId, itemId, quantity, paymentMethod);
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
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

export async function getUserInventory(userId) {
  try {
    const inventory = await shopService.getUserInventory(userId);
    
    return {
      success: true,
      ...inventory
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_user_inventory',
      user_id: userId
    });
    
    return {
      success: false,
      error: error.message,
      inventory: {},
      stats: {}
    };
  }
}

export async function getFeaturedItems() {
  try {
    const featured = await shopService.getFeaturedItems();
    
    return {
      success: true,
      featured
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_featured_items'
    });
    
    return {
      success: false,
      error: error.message,
      featured: {}
    };
  }
}

export async function searchShopItems(searchQuery, filters = {}) {
  try {
    // Get all items
    const allItems = await shopService.getShopItems(filters);
    
    // Filter by search query
    const searchResults = allItems.items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())))
    );

    analyticsService.logEvent('shop_search_performed', {
      category: EventCategory.SHOP,
      search_query: searchQuery,
      results_count: searchResults.length
    });

    return {
      success: true,
      items: searchResults,
      totalCount: searchResults.length,
      query: searchQuery,
      filters
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'search_items'
    });
    
    return {
      success: false,
      error: error.message,
      items: [],
      totalCount: 0
    };
  }
}

// CURRENCY API INTEGRATION

export async function getUserCurrency(userId) {
  try {
    const balances = await currencyProgressionService.getUserBalances(userId);
    
    return {
      success: true,
      balances
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_user_currency',
      user_id: userId
    });
    
    return {
      success: false,
      error: error.message,
      balances: { hubba_bucks: 0, xp: 0, level: 1 }
    };
  }
}

export async function awardCurrency(userId, currencyType, amount, source, metadata = {}) {
  try {
    // Validate currency award
    const validation = await betaFeaturesAPI.validateUserAction(userId, 'currency_award', {
      currency_type: currencyType,
      amount,
      source
    });

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    return await betaFeaturesAPI.awardCurrency(userId, currencyType, amount, source, metadata);
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'award_currency',
      user_id: userId
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// TRANSACTION HISTORY

export async function getUserTransactionHistory(userId, limit = 20) {
  try {
    const purchaseHistory = await shopService.getUserPurchaseHistory(userId);
    
    return {
      success: true,
      transactions: purchaseHistory.slice(0, limit),
      totalCount: purchaseHistory.length
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_transaction_history',
      user_id: userId
    });
    
    return {
      success: false,
      error: error.message,
      transactions: [],
      totalCount: 0
    };
  }
}

// SHOP ANALYTICS

export async function getShopAnalytics() {
  try {
    const stats = await shopService.getShopStats();
    
    return {
      success: true,
      analytics: stats
    };
  } catch (error) {
    GlobalErrorHandler.logNonFatalError(error, {
      feature: 'shop_api',
      action: 'get_shop_analytics'
    });
    
    return {
      success: false,
      error: error.message,
      analytics: {}
    };
  }
}
