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
  runTransaction,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import { currencyProgressionService } from './currencyProgressionService';
import { avatarSystemService } from './avatarSystemService';

class ShopService {
  constructor() {
    this.shopCache = new Map();
    this.inventoryCache = new Map();
    this.purchaseValidation = new Map();
    this.antiCheatFlags = new Map();
  }

  // SHOP INVENTORY MANAGEMENT

  async initializeShopInventory() {
    try {
      const standardGear = await this.getStandardGearInventory();
      const rareCollectibles = await this.getRareCollectiblesInventory();
      
      // Combine inventories
      const fullInventory = {
        ...standardGear,
        ...rareCollectibles,
        lastUpdated: new Date(),
        categories: ['shoes', 'decks', 'wheels', 'trucks', 'clothing', 'accessories', 'stickers']
      };

      // Cache inventory
      this.inventoryCache.set('main_shop', fullInventory);
      
      return fullInventory;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_service',
        action: 'initialize_inventory'
      });
      throw error;
    }
  }

  async getStandardGearInventory() {
    return {
      // STANDARD SHOES (Always Available - Hubba Bucks Only)
      shoes_standard: {
        category: 'shoes',
        tier: 'standard',
        items: [
          {
            id: 'vulc_classic_black',
            name: 'Vulc Classic - Black',
            description: 'Classic low-top vulcanized shoe',
            price: 150, // Hubba Bucks
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { comfort: 3, durability: 3, style: 3 },
            previewModel: '/assets/shop/shoes/vulc_classic_black_preview.glb'
          },
          {
            id: 'vulc_classic_white',
            name: 'Vulc Classic - White', 
            description: 'Clean white vulcanized classic',
            price: 150,
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { comfort: 3, durability: 3, style: 3 },
            previewModel: '/assets/shop/shoes/vulc_classic_white_preview.glb'
          },
          {
            id: 'tech_runner_black_red',
            name: 'Tech Runner - Black/Red',
            description: 'Early 2000s inspired cupsole',
            price: 200,
            currency: 'hubba_bucks', 
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { comfort: 4, durability: 4, style: 3 },
            previewModel: '/assets/shop/shoes/tech_runner_black_red_preview.glb'
          },
          {
            id: 'slip_on_checkerboard',
            name: 'Slip-On - Checkerboard',
            description: 'Iconic checkerboard slip-on',
            price: 175,
            currency: 'hubba_bucks',
            availability: 'always', 
            stock: 'unlimited',
            rarity: 'standard',
            stats: { comfort: 3, durability: 2, style: 5 },
            previewModel: '/assets/shop/shoes/slip_on_checkerboard_preview.glb'
          }
        ]
      },

      // STANDARD DECKS
      decks_standard: {
        category: 'decks',
        tier: 'standard', 
        items: [
          {
            id: 'blank_deck_natural',
            name: 'Blank Deck - Natural',
            description: 'Classic natural wood finish',
            price: 300,
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { pop: 3, durability: 3, style: 2 },
            specs: { length: '32"', width: '8.25"', wheelbase: '14.25"' },
            previewModel: '/assets/shop/decks/blank_natural_preview.glb'
          },
          {
            id: 'blank_deck_black',
            name: 'Blank Deck - Black',
            description: 'Sleek black stain finish',
            price: 325,
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { pop: 3, durability: 3, style: 3 },
            specs: { length: '32"', width: '8.0"', wheelbase: '14.0"' },
            previewModel: '/assets/shop/decks/blank_black_preview.glb'
          },
          {
            id: 'street_series_logo',
            name: 'Street Series Logo',
            description: 'SkateHubba branded street deck',
            price: 400,
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { pop: 4, durability: 4, style: 3 },
            specs: { length: '32"', width: '8.5"', wheelbase: '14.5"' },
            previewModel: '/assets/shop/decks/street_series_preview.glb'
          }
        ]
      },

      // STANDARD WHEELS & TRUCKS
      hardware_standard: {
        category: 'hardware',
        tier: 'standard',
        items: [
          {
            id: 'street_wheels_white',
            name: 'Street Wheels - White 52mm',
            description: 'Standard street wheels',
            price: 100,
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { speed: 3, grip: 3, durability: 3 },
            specs: { size: '52mm', hardness: '99A' }
          },
          {
            id: 'silver_trucks_standard',
            name: 'Silver Trucks - Standard',
            description: 'Reliable aluminum trucks',
            price: 250,
            currency: 'hubba_bucks',
            availability: 'always',
            stock: 'unlimited',
            rarity: 'standard',
            stats: { stability: 3, grind: 3, durability: 4 },
            specs: { width: '139mm', height: 'mid' }
          }
        ]
      }
    };
  }

  async getRareCollectiblesInventory() {
    return {
      // RARE COLLECTIBLES (Limited Stock)
      collectibles_rare: {
        category: 'collectibles',
        tier: 'rare',
        items: [
          {
            id: 'koston_1_collectible',
            name: 'Koston 1 Retro',
            description: 'Legendary early 2000s pro model',
            price: 2500,
            currency: 'hubba_bucks',
            availability: 'limited',
            stock: 50,
            remaining: 50,
            rarity: 'rare',
            stats: { comfort: 5, durability: 4, style: 5, legacy: 5 },
            collectibleData: {
              serialNumbered: true,
              totalProduction: 50,
              collaborator: 'Eric Koston',
              releaseYear: 2001,
              reissueDate: new Date()
            },
            previewModel: '/assets/shop/collectibles/koston_1_preview.glb'
          },
          {
            id: 'cab_dragon_reissue',
            name: 'Cab Dragon Reissue',
            description: 'Steve Caballero classic reissue',
            price: 3000,
            currency: 'hubba_bucks',
            availability: 'limited',
            stock: 25,
            remaining: 25,
            rarity: 'ultra_rare',
            stats: { pop: 5, durability: 4, style: 5, legacy: 5 },
            collectibleData: {
              serialNumbered: true,
              totalProduction: 25,
              collaborator: 'Steve Caballero',
              releaseYear: 1989,
              reissueDate: new Date()
            },
            previewModel: '/assets/shop/collectibles/cab_dragon_preview.glb'
          }
        ]
      },

      // LIMITED TIME DROPS
      limited_drops: {
        category: 'limited_drops',
        tier: 'exclusive',
        items: [
          {
            id: 'hubba_anniversary_deck',
            name: 'SkateHubba Anniversary Deck',
            description: 'Limited edition anniversary graphic',
            price: 1500,
            currency: 'hubba_bucks',
            availability: 'time_limited',
            stock: 100,
            remaining: 100,
            dropStart: new Date(),
            dropEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            rarity: 'legendary',
            stats: { pop: 4, durability: 5, style: 5, commemoration: 5 }
          }
        ]
      }
    };
  }

  // PURCHASE SYSTEM WITH BACKEND VALIDATION

  async attemptPurchase(userId, itemId, quantity = 1, paymentMethod = 'hubba_bucks') {
    try {
      // Start transaction to ensure atomicity
      return await runTransaction(db, async (transaction) => {
        // 1. Validate user and get current balances
        const userDoc = await transaction.get(doc(db, 'users', userId));
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }

        const userData = userDoc.data();
        const currentHubbaBucks = userData.currency?.hubba_bucks || 0;

        // 2. Get item details and validate availability
        const item = await this.getItemDetails(itemId);
        if (!item) {
          throw new Error('Item not found');
        }

        // 3. Validate purchase eligibility
        await this.validatePurchaseEligibility(userId, item, quantity);

        // 4. Check sufficient funds
        const totalCost = item.price * quantity;
        if (paymentMethod === 'hubba_bucks' && currentHubbaBucks < totalCost) {
          throw new Error(`Insufficient Hubba Bucks. Need ${totalCost}, have ${currentHubbaBucks}`);
        }

        // 5. Update inventory for limited items
        if (item.availability === 'limited' || item.availability === 'time_limited') {
          const inventoryDoc = await transaction.get(doc(db, 'shopInventory', item.category));
          const inventoryData = inventoryDoc.data();
          
          const itemInventory = inventoryData.items.find(i => i.id === itemId);
          if (itemInventory.remaining < quantity) {
            throw new Error('Insufficient stock');
          }

          // Update remaining stock
          itemInventory.remaining -= quantity;
          transaction.update(doc(db, 'shopInventory', item.category), {
            items: inventoryData.items,
            lastUpdated: serverTimestamp()
          });
        }

        // 6. Deduct currency
        transaction.update(doc(db, 'users', userId), {
          [`currency.hubba_bucks`]: increment(-totalCost),
          [`stats.totalSpent`]: increment(totalCost),
          [`stats.itemsPurchased`]: increment(quantity),
          lastActivity: serverTimestamp()
        });

        // 7. Add items to user inventory
        for (let i = 0; i < quantity; i++) {
          const purchaseRecord = {
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            rarity: item.rarity,
            price: item.price,
            currency: paymentMethod,
            purchaseDate: serverTimestamp(),
            serialNumber: item.collectibleData?.serialNumbered ? 
              await this.generateSerialNumber(itemId) : null,
            source: 'shop_purchase'
          };

          transaction.set(doc(collection(db, 'userInventory', userId, 'items')), purchaseRecord);
        }

        // 8. Create purchase record
        const purchaseRecord = {
          userId,
          itemId,
          itemName: item.name,
          quantity,
          totalCost,
          paymentMethod,
          timestamp: serverTimestamp(),
          status: 'completed',
          transactionId: `shop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        transaction.set(doc(collection(db, 'shopTransactions')), purchaseRecord);

        return {
          success: true,
          transactionId: purchaseRecord.transactionId,
          itemsPurchased: quantity,
          totalCost,
          remainingBalance: currentHubbaBucks - totalCost
        };
      });

    } catch (error) {
      analyticsService.logEvent('shop_purchase_failed', {
        category: EventCategory.SHOP,
        user_id: userId,
        item_id: itemId,
        error: error.message
      });
      
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_service',
        action: 'attempt_purchase',
        user_id: userId,
        item_id: itemId
      });
      
      throw error;
    }
  }

  async validatePurchaseEligibility(userId, item, quantity) {
    // Check for purchase limits
    if (item.rarity === 'legendary' || item.rarity === 'ultra_rare') {
      const existingPurchases = await this.getUserPurchaseHistory(userId, item.id);
      if (existingPurchases.length > 0) {
        throw new Error('You can only purchase one of this rare item');
      }
    }

    // Check time-based availability
    if (item.availability === 'time_limited') {
      const now = new Date();
      if (now < item.dropStart || now > item.dropEnd) {
        throw new Error('Item is not currently available');
      }
    }

    // Anti-cheat validation
    const recentPurchases = await this.getRecentPurchases(userId, 60000); // Last minute
    if (recentPurchases.length > 10) {
      throw new Error('Too many recent purchases. Please wait before purchasing again.');
    }

    return true;
  }

  // INVENTORY MANAGEMENT

  async getUserInventory(userId) {
    try {
      const inventoryQuery = query(
        collection(db, 'userInventory', userId, 'items'),
        orderBy('purchaseDate', 'desc')
      );

      const inventorySnapshot = await getDocs(inventoryQuery);
      const inventory = {
        shoes: [],
        decks: [],
        wheels: [],
        trucks: [],
        clothing: [],
        accessories: [],
        collectibles: []
      };

      inventorySnapshot.docs.forEach(doc => {
        const item = { id: doc.id, ...doc.data() };
        inventory[item.category].push(item);
      });

      // Calculate inventory stats
      const stats = {
        totalItems: inventorySnapshot.docs.length,
        totalValue: inventorySnapshot.docs.reduce((sum, doc) => sum + doc.data().price, 0),
        rareItems: inventorySnapshot.docs.filter(doc => 
          ['rare', 'ultra_rare', 'legendary'].includes(doc.data().rarity)
        ).length,
        categories: Object.keys(inventory).filter(cat => inventory[cat].length > 0)
      };

      return { inventory, stats };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_service',
        action: 'get_user_inventory',
        user_id: userId
      });
      throw error;
    }
  }

  // SHOP BROWSING & SEARCH

  async getShopItems(filters = {}) {
    try {
      const { 
        category = 'all',
        rarity = 'all',
        priceRange = [0, 10000],
        availability = 'all',
        sortBy = 'popular'
      } = filters;

      // Get items from cache or database
      let allItems = [];
      
      if (this.inventoryCache.has('main_shop')) {
        const inventory = this.inventoryCache.get('main_shop');
        allItems = this.flattenInventory(inventory);
      } else {
        const inventory = await this.initializeShopInventory();
        allItems = this.flattenInventory(inventory);
      }

      // Apply filters
      let filteredItems = allItems;

      if (category !== 'all') {
        filteredItems = filteredItems.filter(item => item.category === category);
      }

      if (rarity !== 'all') {
        filteredItems = filteredItems.filter(item => item.rarity === rarity);
      }

      filteredItems = filteredItems.filter(item => 
        item.price >= priceRange[0] && item.price <= priceRange[1]
      );

      if (availability !== 'all') {
        filteredItems = filteredItems.filter(item => item.availability === availability);
      }

      // Sort items
      filteredItems = this.sortShopItems(filteredItems, sortBy);

      return {
        items: filteredItems,
        totalCount: filteredItems.length,
        filters: filters,
        categories: ['shoes', 'decks', 'wheels', 'trucks', 'clothing', 'accessories'],
        rarities: ['standard', 'rare', 'ultra_rare', 'legendary']
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'shop_service',
        action: 'get_shop_items'
      });
      throw error;
    }
  }

  flattenInventory(inventory) {
    const items = [];
    Object.values(inventory).forEach(section => {
      if (section.items) {
        items.push(...section.items);
      }
    });
    return items;
  }

  sortShopItems(items, sortBy) {
    switch (sortBy) {
      case 'price_low':
        return items.sort((a, b) => a.price - b.price);
      case 'price_high':
        return items.sort((a, b) => b.price - a.price);
      case 'newest':
        return items.sort((a, b) => new Date(b.reissueDate || 0) - new Date(a.reissueDate || 0));
      case 'rarity':
        const rarityOrder = { standard: 1, rare: 2, ultra_rare: 3, legendary: 4 };
        return items.sort((a, b) => rarityOrder[b.rarity] - rarityOrder[a.rarity]);
      case 'popular':
      default:
        return items.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
    }
  }

  // HELPER METHODS

  async getItemDetails(itemId) {
    // Search through all inventory sections
    const inventory = await this.initializeShopInventory();
    const allItems = this.flattenInventory(inventory);
    return allItems.find(item => item.id === itemId);
  }

  async getUserPurchaseHistory(userId, itemId = null) {
    const q = itemId 
      ? query(collection(db, 'shopTransactions'), 
          where('userId', '==', userId),
          where('itemId', '==', itemId))
      : query(collection(db, 'shopTransactions'),
          where('userId', '==', userId),
          orderBy('timestamp', 'desc'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getRecentPurchases(userId, timeWindowMs) {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const q = query(
      collection(db, 'shopTransactions'),
      where('userId', '==', userId),
      where('timestamp', '>=', cutoff)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async generateSerialNumber(itemId) {
    // Generate unique serial number for collectible items
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `${itemId.toUpperCase()}-${timestamp}-${random}`;
  }

  // FEATURED ITEMS & PROMOTIONS

  async getFeaturedItems() {
    return {
      dailyDeal: {
        id: 'vulc_classic_special',
        name: 'Vulc Classic - Daily Deal',
        originalPrice: 150,
        salePrice: 100,
        discount: 33,
        timeRemaining: 86400000 // 24 hours in ms
      },
      newArrivals: [
        'koston_1_collectible',
        'cab_dragon_reissue'
      ],
      trending: [
        'slip_on_checkerboard',
        'street_series_logo'
      ]
    };
  }

  async getShopStats() {
    const q = query(collection(db, 'shopTransactions'), orderBy('timestamp', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    
    const transactions = snapshot.docs.map(doc => doc.data());
    const totalRevenue = transactions.reduce((sum, t) => sum + t.totalCost, 0);
    
    return {
      totalTransactions: transactions.length,
      totalRevenue,
      averageOrder: totalRevenue / transactions.length,
      topItems: this.calculateTopItems(transactions)
    };
  }

  calculateTopItems(transactions) {
    const itemCounts = {};
    transactions.forEach(t => {
      itemCounts[t.itemId] = (itemCounts[t.itemId] || 0) + t.quantity;
    });

    return Object.entries(itemCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([itemId, count]) => ({ itemId, salesCount: count }));
  }
}

export const shopService = new ShopService();
export default ShopService;
