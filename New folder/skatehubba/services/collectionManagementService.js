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
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class CollectionManagementService {
  constructor() {
    this.collectionWatchers = new Map();
    this.showcaseTimers = new Map();
  }

  // COLLECTION ORGANIZATION

  async getUserCollection(userId, filters = {}) {
    try {
      const {
        rarity,
        category,
        sortBy = 'acquired_date',
        groupBy = 'none',
        search
      } = filters;

      let q = query(
        collection(db, 'collectableOwnership'),
        where('userId', '==', userId)
      );

      // Apply rarity filter
      if (rarity && rarity !== 'all') {
        q = query(q, where('rarity', '==', rarity));
      }

      // Apply category filter
      if (category && category !== 'all') {
        q = query(q, where('category', '==', category));
      }

      // Apply sorting
      switch (sortBy) {
        case 'acquired_date':
          q = query(q, orderBy('acquiredAt', 'desc'));
          break;
        case 'rarity':
          q = query(q, orderBy('rarity', 'desc'));
          break;
        case 'value':
          q = query(q, orderBy('estimatedValue', 'desc'));
          break;
        case 'serial_number':
          q = query(q, orderBy('serialNumber', 'asc'));
          break;
        case 'name':
          q = query(q, orderBy('itemDetails.name', 'asc'));
          break;
      }

      const snapshot = await getDocs(q);
      let items = snapshot.docs.map(doc => {
        const item = { id: doc.id, ...doc.data() };
        return {
          ...item,
          displayValue: this.formatItemValue(item.estimatedValue),
          rarityColor: this.getRarityColor(item.rarity),
          specialSerial: this.isSpecialSerial(item.serialNumber, item.totalProduction),
          timeOwned: this.calculateTimeOwned(item.acquiredAt),
          provenance: this.formatProvenance(item.provenance)
        };
      });

      // Apply search filter
      if (search) {
        const searchTerm = search.toLowerCase();
        items = items.filter(item => 
          item.itemDetails.name.toLowerCase().includes(searchTerm) ||
          item.itemDetails.brand.toLowerCase().includes(searchTerm) ||
          item.serialNumber.toString().includes(searchTerm)
        );
      }

      // Group items if requested
      if (groupBy !== 'none') {
        items = this.groupCollectionItems(items, groupBy);
      }

      // Calculate collection stats
      const stats = this.calculateCollectionStats(items);

      return {
        items,
        stats,
        totalItems: items.length,
        lastUpdated: new Date()
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collection_management',
        action: 'get_user_collection'
      });
      return { items: [], stats: {}, totalItems: 0 };
    }
  }

  groupCollectionItems(items, groupBy) {
    const groups = {};

    items.forEach(item => {
      let groupKey;
      
      switch (groupBy) {
        case 'rarity':
          groupKey = item.rarity;
          break;
        case 'category':
          groupKey = item.category;
          break;
        case 'brand':
          groupKey = item.itemDetails.brand;
          break;
        case 'year':
          groupKey = new Date(item.acquiredAt).getFullYear().toString();
          break;
        case 'value':
          groupKey = this.getValueTier(item.estimatedValue);
          break;
        default:
          groupKey = 'uncategorized';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    // Sort groups by importance/value
    const sortedGroups = Object.keys(groups).sort((a, b) => {
      if (groupBy === 'rarity') {
        const rarityOrder = { mythic: 5, legendary: 4, ultra_rare: 3, rare: 2, common: 1 };
        return (rarityOrder[b] || 0) - (rarityOrder[a] || 0);
      }
      return a.localeCompare(b);
    });

    return sortedGroups.map(groupName => ({
      groupName,
      items: groups[groupName],
      count: groups[groupName].length,
      totalValue: groups[groupName].reduce((sum, item) => sum + (item.estimatedValue || 0), 0)
    }));
  }

  calculateCollectionStats(items) {
    const stats = {
      totalValue: 0,
      rarityBreakdown: { common: 0, rare: 0, ultra_rare: 0, legendary: 0, mythic: 0 },
      categoryBreakdown: {},
      brandBreakdown: {},
      specialSerials: 0,
      averageValue: 0,
      mostValuable: null,
      newestAcquisition: null,
      oldestOwned: null
    };

    if (items.length === 0) return stats;

    let newestDate = new Date(0);
    let oldestDate = new Date();
    let highestValue = 0;

    items.forEach(item => {
      // Total value
      stats.totalValue += item.estimatedValue || 0;

      // Rarity breakdown
      if (stats.rarityBreakdown[item.rarity] !== undefined) {
        stats.rarityBreakdown[item.rarity]++;
      }

      // Category breakdown
      const category = item.category || 'uncategorized';
      stats.categoryBreakdown[category] = (stats.categoryBreakdown[category] || 0) + 1;

      // Brand breakdown
      const brand = item.itemDetails.brand || 'unknown';
      stats.brandBreakdown[brand] = (stats.brandBreakdown[brand] || 0) + 1;

      // Special serials
      if (this.isSpecialSerial(item.serialNumber, item.totalProduction)) {
        stats.specialSerials++;
      }

      // Track dates and values
      const acquiredDate = new Date(item.acquiredAt);
      if (acquiredDate > newestDate) {
        newestDate = acquiredDate;
        stats.newestAcquisition = item;
      }
      if (acquiredDate < oldestDate) {
        oldestDate = acquiredDate;
        stats.oldestOwned = item;
      }

      if ((item.estimatedValue || 0) > highestValue) {
        highestValue = item.estimatedValue || 0;
        stats.mostValuable = item;
      }
    });

    stats.averageValue = Math.round(stats.totalValue / items.length);
    
    return stats;
  }

  // COLLECTION SHOWCASES

  async createCollectionShowcase(userId, showcaseData) {
    try {
      const {
        title,
        description,
        featuredItems,
        layout = 'grid',
        theme = 'dark',
        isPublic = true,
        tags = []
      } = showcaseData;

      // Verify user owns all featured items
      for (const itemId of featuredItems) {
        const ownership = await this.verifyItemOwnership(userId, itemId);
        if (!ownership) {
          throw new Error(`You don't own item ${itemId}`);
        }
      }

      const showcase = {
        userId,
        title,
        description,
        featuredItems,
        layout,
        theme,
        isPublic,
        tags,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        viewCount: 0,
        likeCount: 0,
        shareCount: 0,
        featuredAt: null
      };

      const docRef = await addDoc(collection(db, 'collectionShowcases'), showcase);

      analyticsService.logEvent('showcase_created', {
        category: EventCategory.COLLECTIONS,
        user_id: userId,
        showcase_id: docRef.id,
        featured_items_count: featuredItems.length,
        is_public: isPublic
      });

      return { success: true, showcaseId: docRef.id };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collection_management',
        action: 'create_collection_showcase'
      });
      throw error;
    }
  }

  async updateCollectionShowcase(userId, showcaseId, updates) {
    try {
      const showcaseRef = doc(db, 'collectionShowcases', showcaseId);
      const showcaseSnap = await getDoc(showcaseRef);

      if (!showcaseSnap.exists()) {
        throw new Error('Showcase not found');
      }

      const showcase = showcaseSnap.data();
      if (showcase.userId !== userId) {
        throw new Error('You can only edit your own showcases');
      }

      // Verify ownership of any new featured items
      if (updates.featuredItems) {
        for (const itemId of updates.featuredItems) {
          const ownership = await this.verifyItemOwnership(userId, itemId);
          if (!ownership) {
            throw new Error(`You don't own item ${itemId}`);
          }
        }
      }

      await updateDoc(showcaseRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collection_management',
        action: 'update_collection_showcase'
      });
      throw error;
    }
  }

  async getPopularShowcases(limit = 20) {
    try {
      const q = query(
        collection(db, 'collectionShowcases'),
        where('isPublic', '==', true),
        orderBy('likeCount', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(q);
      const showcases = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Enrich with owner information and featured item details
      for (const showcase of showcases) {
        showcase.owner = await this.getUserDisplayInfo(showcase.userId);
        showcase.featuredItemDetails = await this.getFeaturedItemDetails(showcase.featuredItems);
        showcase.stats = {
          engagement: showcase.likeCount + showcase.shareCount,
          viewsPerLike: showcase.likeCount > 0 ? Math.round(showcase.viewCount / showcase.likeCount) : 0
        };
      }

      return showcases;
    } catch (error) {
      return [];
    }
  }

  async getUserShowcases(userId) {
    try {
      const q = query(
        collection(db, 'collectionShowcases'),
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      return [];
    }
  }

  // COLLECTION ANALYTICS

  async getCollectionInsights(userId) {
    try {
      const collection = await this.getUserCollection(userId);
      const items = collection.items;

      const insights = {
        overview: {
          totalItems: items.length,
          totalValue: collection.stats.totalValue,
          averageValue: collection.stats.averageValue,
          portfolioGrowth: await this.calculatePortfolioGrowth(userId)
        },
        rarity: {
          distribution: collection.stats.rarityBreakdown,
          rarityScore: this.calculateRarityScore(collection.stats.rarityBreakdown),
          missingRarities: this.findMissingRarities(collection.stats.rarityBreakdown)
        },
        acquisition: {
          acquisitionTrend: await this.getAcquisitionTrend(userId),
          averageHoldingTime: this.calculateAverageHoldingTime(items),
          acquisitionSources: this.analyzeAcquisitionSources(items)
        },
        market: {
          marketPosition: await this.calculateMarketPosition(userId),
          valueTrends: await this.getValueTrends(items),
          investmentPerformance: await this.calculateInvestmentPerformance(items)
        },
        recommendations: await this.generateCollectionRecommendations(userId, items)
      };

      return insights;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collection_management',
        action: 'get_collection_insights'
      });
      return {};
    }
  }

  calculateRarityScore(rarityBreakdown) {
    const weights = { common: 1, rare: 5, ultra_rare: 15, legendary: 50, mythic: 200 };
    let totalScore = 0;
    
    Object.entries(rarityBreakdown).forEach(([rarity, count]) => {
      totalScore += (weights[rarity] || 0) * count;
    });
    
    return totalScore;
  }

  findMissingRarities(rarityBreakdown) {
    const allRarities = ['common', 'rare', 'ultra_rare', 'legendary', 'mythic'];
    return allRarities.filter(rarity => !rarityBreakdown[rarity] || rarityBreakdown[rarity] === 0);
  }

  calculateAverageHoldingTime(items) {
    if (items.length === 0) return 0;
    
    const now = new Date();
    const totalDays = items.reduce((sum, item) => {
      const acquiredDate = new Date(item.acquiredAt);
      const daysDiff = Math.floor((now - acquiredDate) / (1000 * 60 * 60 * 24));
      return sum + daysDiff;
    }, 0);
    
    return Math.round(totalDays / items.length);
  }

  analyzeAcquisitionSources(items) {
    const sources = {};
    
    items.forEach(item => {
      const source = item.source || 'unknown';
      sources[source] = (sources[source] || 0) + 1;
    });
    
    return sources;
  }

  async generateCollectionRecommendations(userId, items) {
    const recommendations = [];

    // Check for missing rarities
    const rarityBreakdown = {};
    items.forEach(item => {
      rarityBreakdown[item.rarity] = (rarityBreakdown[item.rarity] || 0) + 1;
    });

    const missingRarities = this.findMissingRarities(rarityBreakdown);
    if (missingRarities.length > 0) {
      recommendations.push({
        type: 'missing_rarity',
        title: 'Complete Your Collection',
        description: `You're missing ${missingRarities.join(', ')} items. Consider adding these to round out your collection.`,
        priority: 'medium',
        rarities: missingRarities
      });
    }

    // Check for underrepresented brands
    const brandBreakdown = {};
    items.forEach(item => {
      const brand = item.itemDetails.brand;
      brandBreakdown[brand] = (brandBreakdown[brand] || 0) + 1;
    });

    const dominantBrand = Object.entries(brandBreakdown)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (dominantBrand && dominantBrand[1] > items.length * 0.6) {
      recommendations.push({
        type: 'diversify_brands',
        title: 'Diversify Your Collection',
        description: `${Math.round((dominantBrand[1] / items.length) * 100)}% of your collection is ${dominantBrand[0]}. Consider exploring other brands.`,
        priority: 'low'
      });
    }

    // Check for investment opportunities
    const lowValueItems = items.filter(item => (item.estimatedValue || 0) < 500);
    if (lowValueItems.length < items.length * 0.3) {
      recommendations.push({
        type: 'investment_opportunity',
        title: 'Consider Budget-Friendly Additions',
        description: 'Look for emerging items that could appreciate in value over time.',
        priority: 'low'
      });
    }

    return recommendations;
  }

  // WISHLIST MANAGEMENT

  async addToWishlist(userId, itemId, notes = '') {
    try {
      const wishlistItem = {
        userId,
        itemId,
        notes,
        addedAt: serverTimestamp(),
        priority: 'medium',
        priceTarget: null,
        notifyOnAvailable: true
      };

      const docRef = await addDoc(collection(db, 'wishlistItems'), wishlistItem);

      analyticsService.logEvent('wishlist_item_added', {
        category: EventCategory.COLLECTIONS,
        user_id: userId,
        item_id: itemId
      });

      return { success: true, wishlistItemId: docRef.id };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'collection_management',
        action: 'add_to_wishlist'
      });
      throw error;
    }
  }

  async getUserWishlist(userId) {
    try {
      const q = query(
        collection(db, 'wishlistItems'),
        where('userId', '==', userId),
        orderBy('addedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const wishlistItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Enrich with item details and availability
      for (const item of wishlistItems) {
        item.itemDetails = await this.getItemDetails(item.itemId);
        item.availability = await this.checkItemAvailability(item.itemId);
      }

      return wishlistItems;
    } catch (error) {
      return [];
    }
  }

  // UTILITY FUNCTIONS

  async verifyItemOwnership(userId, itemId) {
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

  formatItemValue(value) {
    if (!value) return '—';
    
    if (value >= 10000) {
      return `${(value / 1000).toFixed(1)}K HB`;
    }
    return `${value.toLocaleString()} HB`;
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

  isSpecialSerial(serialNumber, totalProduction) {
    if (!serialNumber || !totalProduction) return false;
    
    const special = [1, 69, 420, 777, 1337];
    return special.includes(serialNumber) || 
           serialNumber === totalProduction ||
           serialNumber <= 10 ||
           serialNumber % 100 === 0;
  }

  calculateTimeOwned(acquiredAt) {
    const now = new Date();
    const acquired = new Date(acquiredAt);
    const daysDiff = Math.floor((now - acquired) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) return 'Today';
    if (daysDiff === 1) return 'Yesterday';
    if (daysDiff < 7) return `${daysDiff} days ago`;
    if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
    if (daysDiff < 365) return `${Math.floor(daysDiff / 30)} months ago`;
    return `${Math.floor(daysDiff / 365)} years ago`;
  }

  formatProvenance(provenance) {
    if (!provenance || provenance.length === 0) return 'Original owner';
    
    const events = provenance.map(event => {
      switch (event.event) {
        case 'purchased':
          return 'Purchased from shop';
        case 'traded':
          return `Traded from ${event.fromUser}`;
        case 'gifted':
          return `Gifted by ${event.fromUser}`;
        default:
          return event.event;
      }
    });
    
    return events.join(' → ');
  }

  getValueTier(value) {
    if (value >= 10000) return 'High Value (10K+)';
    if (value >= 5000) return 'Premium (5K-10K)';
    if (value >= 1000) return 'Mid-Tier (1K-5K)';
    if (value >= 500) return 'Entry Level (500-1K)';
    return 'Budget (<500)';
  }

  async getUserDisplayInfo(userId) {
    // Simplified user info for privacy
    return {
      username: `User${userId.slice(-6)}`,
      collectionSize: 0,
      joinDate: new Date()
    };
  }

  async getFeaturedItemDetails(itemIds) {
    // Return basic item details for featured items
    return itemIds.map(id => ({
      id,
      name: `Item ${id}`,
      rarity: 'rare',
      imageUrl: '/assets/items/placeholder.png'
    }));
  }

  async getItemDetails(itemId) {
    // Return item details
    return {
      id: itemId,
      name: `Item ${itemId}`,
      brand: 'Unknown',
      category: 'skateboard',
      rarity: 'rare'
    };
  }

  async checkItemAvailability(itemId) {
    return {
      inStock: false,
      nextDrop: null,
      estimatedPrice: 0
    };
  }

  async calculatePortfolioGrowth(userId) {
    // Simplified growth calculation
    return {
      last30Days: 0,
      last90Days: 0,
      allTime: 0
    };
  }

  async getAcquisitionTrend(userId) {
    // Simplified trend data
    return {
      thisMonth: 0,
      lastMonth: 0,
      trend: 'stable'
    };
  }

  async calculateMarketPosition(userId) {
    return {
      percentile: 50,
      rank: 'Average Collector'
    };
  }

  async getValueTrends(items) {
    return {
      trending: 'stable',
      changePercent: 0
    };
  }

  async calculateInvestmentPerformance(items) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      bestPerformer: null
    };
  }

  cleanup() {
    // Clean up watchers and timers
    this.collectionWatchers.forEach(unsubscribe => unsubscribe());
    this.showcaseTimers.forEach(timer => clearTimeout(timer));
    this.collectionWatchers.clear();
    this.showcaseTimers.clear();
  }
}

export default new CollectionManagementService();
