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
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class ShopIntegrationService {
  constructor() {
    this.brands = new Map();
    this.inventory = new Map();
    this.wishlist = new Map();
    this.deals = new Map();
    this.cart = new Map();
  }

  // Product Management
  async getProducts(filters = {}) {
    try {
      let q = collection(db, 'products');
      
      if (filters.category) {
        q = query(q, where('category', '==', filters.category));
      }
      
      if (filters.brand) {
        q = query(q, where('brand', '==', filters.brand));
      }
      
      if (filters.priceRange) {
        q = query(q, 
          where('price', '>=', filters.priceRange.min),
          where('price', '<=', filters.priceRange.max)
        );
      }

      if (filters.featured) {
        q = query(q, where('featured', '==', true));
      }

      q = query(q, orderBy('createdAt', 'desc'));

      if (filters.limit) {
        q = query(q, limit(filters.limit));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_products'
      });
      return [];
    }
  }

  async getProduct(productId) {
    try {
      const productRef = doc(db, 'products', productId);
      const productSnap = await getDoc(productRef);
      
      if (!productSnap.exists()) {
        return null;
      }

      const product = { id: productSnap.id, ...productSnap.data() };
      
      // Track product view
      analyticsService.logEvent('product_viewed', {
        category: EventCategory.SHOP,
        product_id: productId,
        product_name: product.name,
        product_brand: product.brand,
        product_price: product.price
      });

      return product;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_product'
      });
      return null;
    }
  }

  async searchProducts(searchTerm, filters = {}) {
    try {
      const products = await this.getProducts(filters);
      
      const searchResults = products.filter(product => {
        const searchString = `${product.name} ${product.brand} ${product.description} ${product.tags?.join(' ')}`.toLowerCase();
        return searchString.includes(searchTerm.toLowerCase());
      });

      analyticsService.logEvent('product_search', {
        category: EventCategory.SHOP,
        search_term: searchTerm,
        results_count: searchResults.length
      });

      return searchResults;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'search_products'
      });
      return [];
    }
  }

  // AR Try-On Feature
  async getARModel(productId) {
    try {
      const product = await this.getProduct(productId);
      
      if (!product || !product.arModel) {
        return null;
      }

      return {
        modelUrl: product.arModel.url,
        scale: product.arModel.scale || 1,
        position: product.arModel.position || [0, 0, 0],
        rotation: product.arModel.rotation || [0, 0, 0],
        animations: product.arModel.animations || [],
        materials: product.arModel.materials || []
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_ar_model'
      });
      return null;
    }
  }

  async logARTryOn(productId, userId, duration) {
    try {
      const tryOnData = {
        productId,
        userId,
        duration,
        timestamp: new Date(),
        converted: false
      };

      await addDoc(collection(db, 'arTryOns'), tryOnData);

      analyticsService.logEvent('ar_try_on', {
        category: EventCategory.SHOP,
        product_id: productId,
        user_id: userId,
        duration: duration
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'log_ar_try_on'
      });
      return false;
    }
  }

  // Personalized Recommendations
  async getRecommendations(userId, type = 'general') {
    try {
      const userProfile = await this.getUserShopProfile(userId);
      let recommendations = [];

      switch (type) {
        case 'based_on_style':
          recommendations = await this.getStyleBasedRecommendations(userProfile);
          break;
        
        case 'trending':
          recommendations = await this.getTrendingProducts(userProfile);
          break;
        
        case 'similar_users':
          recommendations = await this.getSimilarUserRecommendations(userId);
          break;
        
        case 'price_range':
          recommendations = await this.getPriceRangeRecommendations(userProfile);
          break;
        
        default:
          recommendations = await this.getGeneralRecommendations(userProfile);
      }

      analyticsService.logEvent('recommendations_viewed', {
        category: EventCategory.SHOP,
        user_id: userId,
        recommendation_type: type,
        products_count: recommendations.length
      });

      return recommendations;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_recommendations'
      });
      return [];
    }
  }

  async getStyleBasedRecommendations(userProfile) {
    const style = userProfile.preferredStyle || 'street';
    const favoriteCategories = userProfile.favoriteCategories || ['decks', 'shoes'];
    
    return await this.getProducts({
      category: favoriteCategories[0],
      featured: true,
      limit: 10
    });
  }

  async getTrendingProducts(userProfile) {
    const q = query(
      collection(db, 'products'),
      where('trending', '==', true),
      orderBy('trendingScore', 'desc'),
      limit(15)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Wishlist Management
  async addToWishlist(userId, productId) {
    try {
      const wishlistItem = {
        userId,
        productId,
        addedAt: new Date(),
        notifyOnSale: true,
        priority: 'medium'
      };

      await addDoc(collection(db, 'wishlist'), wishlistItem);

      analyticsService.logEvent('wishlist_add', {
        category: EventCategory.SHOP,
        user_id: userId,
        product_id: productId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'add_to_wishlist'
      });
      return false;
    }
  }

  async removeFromWishlist(userId, productId) {
    try {
      const q = query(
        collection(db, 'wishlist'),
        where('userId', '==', userId),
        where('productId', '==', productId)
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      analyticsService.logEvent('wishlist_remove', {
        category: EventCategory.SHOP,
        user_id: userId,
        product_id: productId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'remove_from_wishlist'
      });
      return false;
    }
  }

  async getUserWishlist(userId) {
    try {
      const q = query(
        collection(db, 'wishlist'),
        where('userId', '==', userId),
        orderBy('addedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const wishlistItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Get product details for each wishlist item
      const products = await Promise.all(
        wishlistItems.map(item => this.getProduct(item.productId))
      );

      return wishlistItems.map((item, index) => ({
        ...item,
        product: products[index]
      })).filter(item => item.product); // Remove items with deleted products

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_user_wishlist'
      });
      return [];
    }
  }

  // Price Alert System
  async createPriceAlert(userId, productId, targetPrice) {
    try {
      const alert = {
        userId,
        productId,
        targetPrice,
        currentPrice: null,
        isActive: true,
        createdAt: new Date(),
        triggeredAt: null
      };

      // Get current price
      const product = await this.getProduct(productId);
      if (product) {
        alert.currentPrice = product.price;
      }

      await addDoc(collection(db, 'priceAlerts'), alert);

      analyticsService.logEvent('price_alert_created', {
        category: EventCategory.SHOP,
        user_id: userId,
        product_id: productId,
        target_price: targetPrice
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'create_price_alert'
      });
      return false;
    }
  }

  // Deal Notifications
  async getActiveDeals(category = null) {
    try {
      let q = query(
        collection(db, 'deals'),
        where('isActive', '==', true),
        where('expiresAt', '>', new Date())
      );

      if (category) {
        q = query(q, where('category', '==', category));
      }

      q = query(q, orderBy('discountPercent', 'desc'));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_active_deals'
      });
      return [];
    }
  }

  async notifyUserOfDeal(userId, dealId) {
    try {
      const notification = {
        userId,
        type: 'deal_alert',
        dealId,
        title: 'Deal Alert!',
        message: 'A product on your wishlist is on sale!',
        read: false,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'notifications'), notification);
      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'notify_user_of_deal'
      });
      return false;
    }
  }

  // User Shopping Profile
  async getUserShopProfile(userId) {
    try {
      const profileRef = doc(db, 'shopProfiles', userId);
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        // Create default profile
        const defaultProfile = {
          userId,
          preferredStyle: 'street',
          favoriteCategories: ['decks', 'shoes'],
          budgetRange: { min: 50, max: 300 },
          favoriteBrands: [],
          sizes: {
            shoes: null,
            clothing: null
          },
          preferences: {
            sustainableProducts: false,
            localBrands: false,
            premiumOnly: false
          },
          purchaseHistory: [],
          createdAt: new Date()
        };

        await updateDoc(profileRef, defaultProfile);
        return defaultProfile;
      }

      return { id: profileSnap.id, ...profileSnap.data() };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'get_user_shop_profile'
      });
      return {};
    }
  }

  async updateShopProfile(userId, updates) {
    try {
      const profileRef = doc(db, 'shopProfiles', userId);
      await updateDoc(profileRef, {
        ...updates,
        updatedAt: new Date()
      });

      analyticsService.logEvent('shop_profile_updated', {
        category: EventCategory.SHOP,
        user_id: userId
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'update_shop_profile'
      });
      return false;
    }
  }

  // Affiliate Link Management
  generateAffiliateLink(productId, userId, platform = 'default') {
    try {
      const baseUrl = 'https://shop.skatehubba.com';
      const affiliateCode = `${userId}_${Date.now()}`;
      
      analyticsService.logEvent('affiliate_link_generated', {
        category: EventCategory.SHOP,
        product_id: productId,
        user_id: userId,
        platform: platform
      });

      return `${baseUrl}/product/${productId}?ref=${affiliateCode}&platform=${platform}`;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'generate_affiliate_link'
      });
      return null;
    }
  }

  async trackAffiliatePurchase(affiliateCode, productId, purchaseAmount) {
    try {
      const purchase = {
        affiliateCode,
        productId,
        purchaseAmount,
        commission: purchaseAmount * 0.05, // 5% commission
        timestamp: new Date(),
        status: 'pending'
      };

      await addDoc(collection(db, 'affiliatePurchases'), purchase);

      analyticsService.logEvent('affiliate_purchase', {
        category: EventCategory.SHOP,
        affiliate_code: affiliateCode,
        product_id: productId,
        purchase_amount: purchaseAmount,
        commission: purchase.commission
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'track_affiliate_purchase'
      });
      return false;
    }
  }

  // Inventory Management for Local Shops
  async addLocalShopInventory(shopId, products) {
    try {
      const inventory = {
        shopId,
        products,
        lastUpdated: new Date(),
        isActive: true
      };

      await addDoc(collection(db, 'localInventory'), inventory);
      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'add_local_shop_inventory'
      });
      return false;
    }
  }

  async findNearbyShops(userLocation, radius = 25) {
    try {
      // This would typically use geospatial queries
      // For now, we'll simulate with a basic query
      const q = query(
        collection(db, 'localShops'),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      const shops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter by distance (simplified)
      const nearbyShops = shops.filter(shop => {
        const distance = this.calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          shop.location.latitude,
          shop.location.longitude
        );
        return distance <= radius;
      });

      return nearbyShops;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_integration',
        action: 'find_nearby_shops'
      });
      return [];
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

export default new ShopIntegrationService();
