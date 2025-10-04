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
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class ShopConfigService {
  constructor() {
    this.shopCategories = new Map();
    this.featuredItems = new Map();
    this.limitedDrops = new Map();
    this.rotationSchedule = new Map();
  }

  // Shop Item Management
  async createShopItem(itemData) {
    try {
      const item = {
        name: itemData.name,
        description: itemData.description,
        category: itemData.category, // 'avatars', 'decks', 'accessories', 'cosmetics', 'gear'
        subcategory: itemData.subcategory,
        type: itemData.type, // 'consumable', 'permanent', 'limited_time'
        rarity: itemData.rarity, // 'common', 'rare', 'epic', 'legendary'
        
        // Currency & Pricing
        currencies: itemData.currencies, // ['hubba_bucks'], ['xp'], or ['both']
        prices: {
          hubba_bucks: itemData.hubbaBucksPrice || null,
          xp: itemData.xpPrice || null
        },
        
        // Availability
        isActive: itemData.isActive !== false,
        isConsumable: itemData.isConsumable || false,
        isLimited: itemData.isLimited || false,
        stock: itemData.stock || null,
        maxStock: itemData.maxStock || null,
        
        // Time Restrictions
        availableFrom: itemData.availableFrom || new Date(),
        availableUntil: itemData.availableUntil || null,
        
        // Requirements
        levelRequired: itemData.levelRequired || 1,
        prerequisiteItems: itemData.prerequisiteItems || [],
        prerequisiteAchievements: itemData.prerequisiteAchievements || [],
        
        // Visual & Meta
        imageUrl: itemData.imageUrl,
        iconUrl: itemData.iconUrl,
        previewUrl: itemData.previewUrl, // For 3D models, videos
        tags: itemData.tags || [],
        
        // Shop Display
        isFeatured: itemData.isFeatured || false,
        isNew: itemData.isNew || false,
        isPopular: itemData.isPopular || false,
        displayOrder: itemData.displayOrder || 0,
        
        // Analytics
        totalSold: 0,
        totalRevenue: {
          hubba_bucks: 0,
          xp: 0
        },
        
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const itemRef = await addDoc(collection(db, 'shopItems'), item);
      
      analyticsService.logEvent('shop_item_created', {
        category: EventCategory.CONTENT,
        item_id: itemRef.id,
        item_category: item.category,
        rarity: item.rarity,
        currencies: item.currencies.join(','),
        hubba_bucks_price: item.prices.hubba_bucks,
        xp_price: item.prices.xp
      });

      return { id: itemRef.id, ...item };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'create_shop_item'
      });
      throw new Error('Failed to create shop item');
    }
  }

  // Pre-configured Shop Items
  async initializeDefaultShopItems() {
    const defaultItems = [
      // HUBBA BUCKS EXCLUSIVES
      {
        name: 'Golden Skateboard',
        description: 'Exclusive golden deck that shows your premium status',
        category: 'decks',
        rarity: 'legendary',
        currencies: ['hubba_bucks'],
        hubbaBucksPrice: 2500,
        imageUrl: '/assets/decks/golden_deck.png',
        isFeatured: true,
        tags: ['exclusive', 'premium', 'golden']
      },
      {
        name: 'VIP Avatar Pack',
        description: 'Exclusive avatar collection for VIP members',
        category: 'avatars',
        rarity: 'epic',
        currencies: ['hubba_bucks'],
        hubbaBucksPrice: 1500,
        imageUrl: '/assets/avatars/vip_pack.png',
        isFeatured: true
      },
      {
        name: 'Neon Grip Tape',
        description: 'Glowing grip tape that lights up in AR mode',
        category: 'accessories',
        rarity: 'rare',
        currencies: ['hubba_bucks'],
        hubbaBucksPrice: 750,
        imageUrl: '/assets/accessories/neon_grip.png'
      },
      
      // XP PROGRESSION REWARDS
      {
        name: 'Basic Skater Avatar',
        description: 'Starter avatar for new skaters',
        category: 'avatars',
        rarity: 'common',
        currencies: ['xp'],
        xpPrice: 500,
        imageUrl: '/assets/avatars/basic_skater.png',
        isNew: true
      },
      {
        name: 'Street Style Deck',
        description: 'Classic street skating deck design',
        category: 'decks',
        rarity: 'common',
        currencies: ['xp'],
        xpPrice: 1000,
        imageUrl: '/assets/decks/street_style.png'
      },
      {
        name: 'Progression Badge',
        description: 'Show off your skating progress',
        category: 'badges',
        rarity: 'rare',
        currencies: ['xp'],
        xpPrice: 2000,
        levelRequired: 10,
        imageUrl: '/assets/badges/progression.png'
      },
      
      // DUAL CURRENCY ITEMS
      {
        name: 'Pro Skater Bundle',
        description: 'Complete pro setup - pay with either currency',
        category: 'bundles',
        rarity: 'epic',
        currencies: ['both'],
        hubbaBucksPrice: 2000,
        xpPrice: 5000,
        imageUrl: '/assets/bundles/pro_skater.png',
        isFeatured: true,
        levelRequired: 15
      },
      
      // LIMITED TIME ITEMS
      {
        name: 'Summer 2025 Deck',
        description: 'Limited edition summer collection deck',
        category: 'decks',
        rarity: 'legendary',
        currencies: ['hubba_bucks'],
        hubbaBucksPrice: 3000,
        isLimited: true,
        stock: 100,
        maxStock: 100,
        availableUntil: new Date('2025-08-31'),
        imageUrl: '/assets/decks/summer_2025.png',
        tags: ['limited', 'summer', 'exclusive']
      }
    ];

    const createdItems = [];
    for (const itemData of defaultItems) {
      try {
        const item = await this.createShopItem(itemData);
        createdItems.push(item);
      } catch (error) {
        console.error('Failed to create item:', itemData.name, error);
      }
    }

    return createdItems;
  }

  // Shop Display & Organization
  async getShopLayout() {
    try {
      const layout = {
        featured: await this.getFeaturedItems(),
        categories: await this.getShopCategories(),
        limitedTime: await this.getLimitedTimeItems(),
        newArrivals: await this.getNewArrivals(),
        popular: await this.getPopularItems(),
        rotatingDeals: await this.getRotatingDeals()
      };

      return layout;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'get_shop_layout'
      });
      return {};
    }
  }

  async getFeaturedItems() {
    try {
      const q = query(
        collection(db, 'shopItems'),
        where('isActive', '==', true),
        where('isFeatured', '==', true),
        orderBy('displayOrder', 'asc'),
        limit(6)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }

  async getLimitedTimeItems() {
    try {
      const now = new Date();
      const q = query(
        collection(db, 'shopItems'),
        where('isActive', '==', true),
        where('isLimited', '==', true),
        where('availableUntil', '>', now),
        orderBy('availableUntil', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        timeRemaining: this.calculateTimeRemaining(doc.data().availableUntil)
      }));
    } catch (error) {
      return [];
    }
  }

  // FOMO & Scarcity Features
  async createLimitedDrop(dropData) {
    try {
      const drop = {
        name: dropData.name,
        description: dropData.description,
        items: dropData.items, // Array of item IDs
        totalStock: dropData.totalStock,
        remainingStock: dropData.totalStock,
        
        // Timing
        announcementTime: dropData.announcementTime,
        releaseTime: dropData.releaseTime,
        endTime: dropData.endTime,
        
        // Pricing
        basePrice: dropData.basePrice,
        currency: dropData.currency,
        dynamicPricing: dropData.dynamicPricing || false, // Price increases as stock decreases
        
        // Access Control
        vipEarlyAccess: dropData.vipEarlyAccess || false,
        levelRequirement: dropData.levelRequirement || 1,
        
        // Marketing
        hypeLevel: 0,
        preRegistrations: 0,
        
        status: 'announced', // 'announced', 'live', 'sold_out', 'ended'
        createdAt: new Date()
      };

      const dropRef = await addDoc(collection(db, 'limitedDrops'), drop);
      
      // Schedule notifications
      await this.scheduleLimitedDropNotifications(dropRef.id, drop);
      
      return { id: dropRef.id, ...drop };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'create_limited_drop'
      });
      throw new Error('Failed to create limited drop');
    }
  }

  async scheduleShopRotation() {
    try {
      const rotation = {
        dailyDeals: await this.generateDailyDeals(),
        weeklySpecials: await this.generateWeeklySpecials(),
        monthlyFeatured: await this.generateMonthlyFeatured(),
        seasonalItems: await this.generateSeasonalItems()
      };

      await addDoc(collection(db, 'shopRotations'), {
        ...rotation,
        scheduledFor: new Date(),
        createdAt: new Date()
      });

      return rotation;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'schedule_shop_rotation'
      });
      return {};
    }
  }

  async generateDailyDeals() {
    // Select 3 random items for daily deals with 20% discount
    const allItems = await this.getAllActiveItems();
    const shuffled = allItems.sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, 3).map(item => ({
      ...item,
      originalPrice: item.prices,
      discountedPrice: {
        hubba_bucks: item.prices.hubba_bucks ? Math.floor(item.prices.hubba_bucks * 0.8) : null,
        xp: item.prices.xp ? Math.floor(item.prices.xp * 0.8) : null
      },
      discountPercentage: 20,
      dealType: 'daily'
    }));
  }

  // Analytics & Insights
  async getShopAnalytics(timeframe = '30days') {
    try {
      const analytics = {
        totalRevenue: await this.getTotalRevenue(timeframe),
        topSellingItems: await this.getTopSellingItems(timeframe),
        currencyDistribution: await this.getCurrencyDistribution(timeframe),
        categoryPerformance: await this.getCategoryPerformance(timeframe),
        userSpendingPatterns: await this.getUserSpendingPatterns(timeframe)
      };

      return analytics;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'get_shop_analytics'
      });
      return {};
    }
  }

  // Inventory Management
  async updateItemStock(itemId, quantity, operation = 'decrement') {
    try {
      const itemRef = doc(db, 'shopItems', itemId);
      const item = await getDoc(itemRef);
      
      if (!item.exists()) {
        throw new Error('Item not found');
      }

      const currentStock = item.data().stock || 0;
      let newStock;

      if (operation === 'decrement') {
        newStock = Math.max(0, currentStock - quantity);
      } else {
        newStock = currentStock + quantity;
      }

      await updateDoc(itemRef, {
        stock: newStock,
        updatedAt: new Date()
      });

      // Check if item sold out
      if (newStock === 0 && currentStock > 0) {
        await this.handleItemSoldOut(itemId);
      }

      return newStock;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'update_item_stock'
      });
      return 0;
    }
  }

  async handleItemSoldOut(itemId) {
    try {
      // Mark item as sold out
      const itemRef = doc(db, 'shopItems', itemId);
      await updateDoc(itemRef, {
        isActive: false,
        soldOutAt: new Date()
      });

      // Send notifications to users who wishlisted this item
      await this.notifyWishlistUsers(itemId, 'sold_out');

      analyticsService.logEvent('item_sold_out', {
        category: EventCategory.ECONOMY,
        item_id: itemId
      });

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_config',
        action: 'handle_item_sold_out'
      });
    }
  }

  // Utility Functions
  calculateTimeRemaining(endTime) {
    const now = new Date();
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return null;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, totalMs: diff };
  }

  async getShopCategories() {
    return [
      {
        id: 'decks',
        name: 'Skateboards',
        icon: '🛹',
        description: 'Complete boards and deck designs'
      },
      {
        id: 'avatars',
        name: 'Avatars',
        icon: '👤',
        description: 'Customize your skater persona'
      },
      {
        id: 'accessories',
        name: 'Gear',
        icon: '⚙️',
        description: 'Wheels, trucks, and accessories'
      },
      {
        id: 'cosmetics',
        name: 'Cosmetics',
        icon: '✨',
        description: 'Visual effects and trails'
      },
      {
        id: 'badges',
        name: 'Badges',
        icon: '🏆',
        description: 'Achievement badges and titles'
      },
      {
        id: 'bundles',
        name: 'Bundles',
        icon: '📦',
        description: 'Value packs and collections'
      }
    ];
  }

  async getAllActiveItems() {
    try {
      const q = query(
        collection(db, 'shopItems'),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }
}

export default new ShopConfigService();
