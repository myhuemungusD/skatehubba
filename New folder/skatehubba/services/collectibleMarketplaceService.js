import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDocs,
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import DigitalGearService from './digitalGearService';

class CollectibleMarketplaceService {
  constructor() {
    this.liveDrops = new Map();
    this.countdownTimers = new Map();
    this.stockWatchers = new Map();
    this.hypeMetrics = new Map();
  }

  // MARKETPLACE UI & EXPERIENCE

  async getMarketplaceLayout() {
    try {
      const layout = {
        heroSection: await this.getHeroSection(),
        liveDrops: await this.getLiveDrops(),
        comingSoon: await this.getComingSoonDrops(),
        featuredCollections: await this.getFeaturedCollections(),
        trendingItems: await this.getTrendingItems(),
        lastChance: await this.getLastChanceItems(),
        recentSales: await this.getRecentSales(),
        collectorsSpotlight: await this.getCollectorsSpotlight()
      };

      return layout;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_marketplace',
        action: 'get_marketplace_layout'
      });
      return {};
    }
  }

  async getHeroSection() {
    try {
      // Get the most hyped upcoming drop
      const q = query(
        collection(db, 'collectableItems'),
        where('status', 'in', ['announced', 'live']),
        orderBy('hypeLevel', 'desc'),
        limit(1)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;

      const heroItem = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      
      return {
        item: heroItem,
        countdown: this.calculateCountdown(heroItem.releaseTime),
        hypeText: this.generateHypeText(heroItem),
        stockAlert: `Only ${heroItem.remainingStock} of ${heroItem.totalProduction} remaining!`,
        isLive: heroItem.status === 'live'
      };
    } catch (error) {
      return null;
    }
  }

  async getLiveDrops() {
    try {
      const q = query(
        collection(db, 'collectableItems'),
        where('status', '==', 'live'),
        orderBy('releaseTime', 'asc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const liveDrops = snapshot.docs.map(doc => {
        const item = { id: doc.id, ...doc.data() };
        return {
          ...item,
          stockPercentage: (item.remainingStock / item.totalProduction) * 100,
          urgencyLevel: this.calculateUrgencyLevel(item),
          timeRemaining: this.calculateTimeRemaining(item.endTime),
          priceDisplay: this.formatPrice(item.price),
          rarityColor: this.getRarityColor(item.rarity),
          soldOutSoon: item.remainingStock <= 5
        };
      });

      return liveDrops;
    } catch (error) {
      return [];
    }
  }

  async getComingSoonDrops() {
    try {
      const q = query(
        collection(db, 'collectableItems'),
        where('status', '==', 'announced'),
        orderBy('releaseTime', 'asc'),
        limit(6)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const item = { id: doc.id, ...doc.data() };
        return {
          ...item,
          countdown: this.calculateCountdown(item.releaseTime),
          canPreOrder: this.canPreOrder(item),
          hypeLevel: item.hypeLevel || 0,
          estimatedDemand: this.calculateEstimatedDemand(item)
        };
      });
    } catch (error) {
      return [];
    }
  }

  async getFeaturedCollections() {
    try {
      const collections = [
        {
          name: 'OG Classics',
          description: 'Legendary pieces that defined skateboarding',
          imageUrl: '/assets/collections/og_classics.png',
          itemCount: 12,
          floorPrice: 2500,
          featured: true
        },
        {
          name: 'Pro Models',
          description: 'Signature gear from skating legends',
          imageUrl: '/assets/collections/pro_models.png',
          itemCount: 25,
          floorPrice: 1500,
          featured: true
        },
        {
          name: 'Vintage Legends',
          description: 'Rare finds from skating\'s golden era',
          imageUrl: '/assets/collections/vintage.png',
          itemCount: 8,
          floorPrice: 5000,
          featured: true
        }
      ];

      // Add real-time stats for each collection
      for (const collection of collections) {
        collection.stats = await this.getCollectionStats(collection.name);
      }

      return collections;
    } catch (error) {
      return [];
    }
  }

  // FOMO & URGENCY MECHANICS

  generateHypeText(item) {
    const hypeTexts = {
      mythic: [
        `🔥 ULTRA RARE DROP! Only ${item.totalProduction} exist!`,
        `⚡ LEGENDARY ALERT! This will sell out in minutes!`,
        `🚨 GRAIL STATUS! Don't miss this once-in-a-lifetime drop!`
      ],
      legendary: [
        `🔥 Only ${item.totalProduction} made! Get yours now!`,
        `⚡ Legendary rarity - these never last long!`,
        `🚨 ${item.remainingStock} left! Don't sleep on this!`
      ],
      ultra_rare: [
        `🔥 Limited to ${item.totalProduction} pieces worldwide!`,
        `⚡ Ultra rare drop - act fast!`,
        `🚨 ${item.remainingStock} remaining!`
      ],
      rare: [
        `Limited edition - only ${item.totalProduction} made!`,
        `Don't miss out - ${item.remainingStock} left!`,
        `Rare find alert! 🚨`
      ],
      common: [
        `New drop available now!`,
        `Add to your collection today!`,
        `Fresh gear just dropped! 🛹`
      ]
    };

    const texts = hypeTexts[item.rarity] || hypeTexts.common;
    return texts[Math.floor(Math.random() * texts.length)];
  }

  calculateUrgencyLevel(item) {
    const stockPercent = (item.remainingStock / item.totalProduction) * 100;
    const timeLeft = item.endTime ? new Date(item.endTime) - new Date() : Infinity;
    const hoursLeft = timeLeft / (1000 * 60 * 60);

    if (stockPercent <= 10 || hoursLeft <= 1) return 'critical';
    if (stockPercent <= 25 || hoursLeft <= 6) return 'high';
    if (stockPercent <= 50 || hoursLeft <= 24) return 'medium';
    return 'low';
  }

  getRarityColor(rarity) {
    const colors = {
      common: '#8E8E93',
      rare: '#007AFF',
      ultra_rare: '#5856D6',
      legendary: '#FF9500',
      mythic: '#FF2D92'
    };
    return colors[rarity] || colors.common;
  }

  formatPrice(price) {
    if (price >= 1000) {
      return `${(price / 1000).toFixed(1)}K HB`;
    }
    return `${price} HB`;
  }

  // REAL-TIME STOCK & COUNTDOWN

  subscribeToLiveDrop(itemId, callback) {
    try {
      const itemRef = doc(db, 'collectableItems', itemId);
      
      const unsubscribe = onSnapshot(itemRef, (doc) => {
        if (doc.exists()) {
          const item = { id: doc.id, ...doc.data() };
          
          // Calculate real-time metrics
          const liveData = {
            ...item,
            stockPercentage: (item.remainingStock / item.totalProduction) * 100,
            urgencyLevel: this.calculateUrgencyLevel(item),
            timeRemaining: this.calculateTimeRemaining(item.endTime),
            soldOut: item.remainingStock === 0,
            justSold: this.checkRecentSale(item)
          };

          callback(liveData);
        }
      });

      this.stockWatchers.set(itemId, unsubscribe);
      return unsubscribe;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_marketplace',
        action: 'subscribe_to_live_drop'
      });
      return () => {};
    }
  }

  startCountdownTimer(itemId, endTime, callback) {
    const timer = setInterval(() => {
      const timeRemaining = this.calculateTimeRemaining(endTime);
      
      if (timeRemaining.totalMs <= 0) {
        clearInterval(timer);
        this.countdownTimers.delete(itemId);
        callback({ expired: true });
      } else {
        callback(timeRemaining);
      }
    }, 1000);

    this.countdownTimers.set(itemId, timer);
    return timer;
  }

  calculateCountdown(targetTime) {
    const now = new Date();
    const target = new Date(targetTime);
    const diff = target.getTime() - now.getTime();
    
    if (diff <= 0) return { expired: true };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return {
      days,
      hours,
      minutes,
      seconds,
      totalMs: diff,
      displayText: this.formatCountdownText(days, hours, minutes, seconds)
    };
  }

  calculateTimeRemaining(endTime) {
    if (!endTime) return null;
    return this.calculateCountdown(endTime);
  }

  formatCountdownText(days, hours, minutes, seconds) {
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  // PURCHASE FLOW OPTIMIZATION

  async initiatePurchaseFlow(userId, itemId) {
    try {
      const item = await this.getCollectableItem(itemId);
      if (!item) throw new Error('Item not found');

      // Pre-flight checks
      const checks = {
        itemAvailable: item.status === 'live' && item.remainingStock > 0,
        userCanAfford: await this.checkUserBalance(userId, item.price),
        userAlreadyOwns: await this.checkUserOwnership(userId, itemId),
        dropActive: this.checkDropTiming(item)
      };

      // Get available serial numbers for selection
      const availableSerials = item.serialNumbers
        .filter(serial => serial.isAvailable)
        .map(serial => ({
          number: serial.number,
          isSpecial: this.isSpecialSerial(serial.number, item.totalProduction)
        }));

      return {
        item: {
          ...item,
          stockAlert: this.generateStockAlert(item),
          urgencyMessage: this.generateUrgencyMessage(item)
        },
        availableSerials,
        checks,
        estimatedCompletionTime: this.estimatePurchaseTime(item),
        similarItems: await this.getSimilarItems(itemId)
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_marketplace',
        action: 'initiate_purchase_flow'
      });
      throw error;
    }
  }

  isSpecialSerial(serialNumber, totalProduction) {
    // Mark special serials like #1, #69, #420, last serial, etc.
    const special = [1, 69, 420, 777, 1337];
    return special.includes(serialNumber) || serialNumber === totalProduction;
  }

  generateStockAlert(item) {
    const remaining = item.remainingStock;
    const total = item.totalProduction;
    const percentage = (remaining / total) * 100;

    if (percentage <= 5) return `🚨 LAST ${remaining}! Almost sold out!`;
    if (percentage <= 10) return `⚠️ Only ${remaining} left! Don't wait!`;
    if (percentage <= 25) return `🔥 ${remaining} of ${total} remaining`;
    return `${remaining} available`;
  }

  generateUrgencyMessage(item) {
    const urgency = this.calculateUrgencyLevel(item);
    const messages = {
      critical: '🚨 SELLING FAST! Complete purchase now!',
      high: '⚠️ Limited stock! Secure yours today!',
      medium: '🔥 Popular item! Get yours soon!',
      low: 'Available now in limited quantities'
    };
    return messages[urgency];
  }

  // ANALYTICS & INSIGHTS

  async trackMarketplaceAnalytics(userId, action, metadata = {}) {
    try {
      const analytics = {
        userId,
        action, // 'view_item', 'add_to_wishlist', 'start_purchase', 'complete_purchase', 'abandon_cart'
        timestamp: new Date(),
        metadata,
        sessionData: {
          userAgent: metadata.userAgent || '',
          referrer: metadata.referrer || '',
          timeOnPage: metadata.timeOnPage || 0
        }
      };

      analyticsService.logEvent(`marketplace_${action}`, {
        category: EventCategory.COLLECTIBLES,
        user_id: userId,
        ...metadata
      });

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collectible_marketplace',
        action: 'track_marketplace_analytics'
      });
    }
  }

  async getMarketplaceInsights() {
    try {
      const insights = {
        totalItems: await this.getTotalActiveItems(),
        totalCollectors: await this.getTotalCollectors(),
        topSellingCategories: await this.getTopSellingCategories(),
        averageSaleTime: await this.getAverageSaleTime(),
        priceRanges: await this.getPriceRanges(),
        rarityDistribution: await this.getRarityDistribution(),
        recentActivity: await this.getRecentMarketActivity()
      };

      return insights;
    } catch (error) {
      return {};
    }
  }

  // SOCIAL PROOF & COMMUNITY

  async getRecentSales() {
    try {
      const q = query(
        collection(db, 'collectableOwnership'),
        where('source', '==', 'primary_purchase'),
        orderBy('purchaseDate', 'desc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const sale = doc.data();
        return {
          itemName: sale.itemDetails.name,
          serialNumber: sale.serialNumber,
          rarity: sale.rarity,
          price: sale.purchasePrice,
          soldAt: sale.purchaseDate,
          timeAgo: this.timeAgo(sale.purchaseDate),
          buyerInfo: {
            isNewCollector: this.isNewCollector(sale.userId),
            collectionSize: 'hidden' // Privacy protection
          }
        };
      });
    } catch (error) {
      return [];
    }
  }

  async getCollectorsSpotlight() {
    try {
      // Feature collectors with impressive collections
      const spotlight = [
        {
          username: 'SkateGod',
          totalItems: 47,
          rareItems: 12,
          recentAcquisition: 'Koston 1s #7',
          profilePic: '/assets/avatars/collector1.png',
          badge: 'Legendary Collector'
        },
        {
          username: 'VintageVibes',
          totalItems: 23,
          rareItems: 8,
          recentAcquisition: 'Powell-Peralta #3',
          profilePic: '/assets/avatars/collector2.png',
          badge: 'Vintage Expert'
        }
      ];

      return spotlight;
    } catch (error) {
      return [];
    }
  }

  // UTILITY FUNCTIONS

  async getCollectableItem(itemId) {
    try {
      const itemRef = doc(db, 'collectableItems', itemId);
      const itemSnap = await getDoc(itemRef);
      return itemSnap.exists() ? { id: itemSnap.id, ...itemSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async checkUserBalance(userId, requiredAmount) {
    try {
      const userRef = doc(db, 'userProfiles', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return false;
      
      const user = userSnap.data();
      return (user.hubbaBucks || 0) >= requiredAmount;
    } catch (error) {
      return false;
    }
  }

  async checkUserOwnership(userId, itemId) {
    try {
      const q = query(
        collection(db, 'collectableOwnership'),
        where('userId', '==', userId),
        where('itemId', '==', itemId)
      );

      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      return false;
    }
  }

  checkDropTiming(item) {
    const now = new Date();
    const releaseTime = new Date(item.releaseTime);
    const endTime = item.endTime ? new Date(item.endTime) : null;

    return now >= releaseTime && (!endTime || now <= endTime);
  }

  timeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  canPreOrder(item) {
    return item.dropType === 'scheduled' && new Date() < new Date(item.releaseTime);
  }

  calculateEstimatedDemand(item) {
    // Simplified demand calculation based on hype level and pre-orders
    const baseScore = item.hypeLevel || 0;
    const preOrderBonus = (item.preOrderCount || 0) * 2;
    const rarityMultiplier = { common: 1, rare: 1.5, ultra_rare: 2, legendary: 3, mythic: 5 }[item.rarity] || 1;
    
    return Math.min(100, baseScore + preOrderBonus * rarityMultiplier);
  }

  checkRecentSale(item) {
    // Check if item was sold in the last few minutes
    return item.lastSoldAt && (new Date() - new Date(item.lastSoldAt)) < 300000; // 5 minutes
  }

  isNewCollector(userId) {
    // Simplified check - would normally query user's collection
    return Math.random() < 0.3; // 30% chance for demo
  }

  estimatePurchaseTime(item) {
    const baseTime = 30; // 30 seconds base
    const complexityBonus = item.rarity === 'mythic' ? 15 : 0; // Extra time for special items
    return baseTime + complexityBonus;
  }

  async getSimilarItems(itemId) {
    // Return similar items based on category/brand
    return [];
  }

  async getCollectionStats(collectionName) {
    return {
      totalVolume: 0,
      averagePrice: 0,
      topSale: 0,
      activeListings: 0
    };
  }

  cleanup() {
    // Clean up timers and watchers
    this.countdownTimers.forEach(timer => clearInterval(timer));
    this.stockWatchers.forEach(unsubscribe => unsubscribe());
    this.countdownTimers.clear();
    this.stockWatchers.clear();
  }
}

export default new CollectibleMarketplaceService();
