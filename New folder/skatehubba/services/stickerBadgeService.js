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
  arrayRemove
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class StickerBadgeService {
  constructor() {
    this.stickerPacks = new Map();
    this.userStickers = new Map();
    this.spotBadges = new Map();
    this.achievements = new Map();
  }

  // Sticker System
  async createStickerPack(creatorId, packData) {
    try {
      const pack = {
        creatorId,
        name: packData.name,
        description: packData.description || '',
        theme: packData.theme, // skate_brands, tricks, spots, crews, emotes, seasonal
        price: packData.price || 0, // 0 for free packs
        currency: packData.currency || 'coins', // coins, real_money
        stickers: packData.stickers || [],
        rarity: packData.rarity || 'common', // common, rare, epic, legendary
        isLimited: packData.isLimited || false,
        limitedQuantity: packData.limitedQuantity,
        availableUntil: packData.availableUntil,
        tags: packData.tags || [],
        metadata: {
          totalStickers: packData.stickers?.length || 0,
          averageRarity: this.calculateAverageRarity(packData.stickers),
          downloadSize: packData.downloadSize || 0
        },
        stats: {
          purchased: 0,
          used: 0,
          ratings: [],
          averageRating: 0
        },
        status: 'active', // active, disabled, pending_review
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const packRef = await addDoc(collection(db, 'stickerPacks'), pack);
      
      analyticsService.logEvent('sticker_pack_created', {
        category: EventCategory.CONTENT,
        creator_id: creatorId,
        pack_id: packRef.id,
        theme: pack.theme,
        price: pack.price,
        stickers_count: pack.metadata.totalStickers
      });

      return { id: packRef.id, ...pack };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'create_sticker_pack'
      });
      throw new Error('Failed to create sticker pack');
    }
  }

  async purchaseStickerPack(userId, packId, paymentMethod = 'coins') {
    try {
      const pack = await this.getStickerPack(packId);
      const userProfile = await this.getUserProfile(userId);
      
      if (!pack) {
        throw new Error('Sticker pack not found');
      }

      // Check if user already owns this pack
      if (userProfile.ownedPacks?.includes(packId)) {
        throw new Error('Pack already owned');
      }

      // Check payment
      if (paymentMethod === 'coins') {
        if (userProfile.coins < pack.price) {
          throw new Error('Insufficient coins');
        }
      }

      // Process purchase
      const purchase = {
        userId,
        packId,
        price: pack.price,
        currency: pack.currency,
        paymentMethod,
        purchasedAt: new Date(),
        stickersUnlocked: pack.stickers.map(sticker => ({
          ...sticker,
          unlockedAt: new Date()
        }))
      };

      await addDoc(collection(db, 'stickerPurchases'), purchase);

      // Update user's sticker collection
      await this.addStickersToUser(userId, pack.stickers, packId);

      // Deduct payment
      if (paymentMethod === 'coins') {
        await this.updateUserCoins(userId, -pack.price);
      }

      // Update pack stats
      await this.updatePackStats(packId, 'purchased');

      analyticsService.logEvent('sticker_pack_purchased', {
        category: EventCategory.SHOP,
        user_id: userId,
        pack_id: packId,
        price: pack.price,
        payment_method: paymentMethod
      });

      return purchase;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'purchase_sticker_pack'
      });
      throw error;
    }
  }

  async addStickersToUser(userId, stickers, packId) {
    try {
      const userStickers = stickers.map(sticker => ({
        ...sticker,
        packId,
        unlockedAt: new Date(),
        usageCount: 0,
        isFavorite: false
      }));

      const userRef = doc(db, 'userStickers', userId);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        await updateDoc(userRef, {
          stickers: arrayUnion(...userStickers),
          ownedPacks: arrayUnion(packId),
          updatedAt: new Date()
        });
      } else {
        await updateDoc(userRef, {
          userId,
          stickers: userStickers,
          ownedPacks: [packId],
          favorites: [],
          totalUsage: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'add_stickers_to_user'
      });
      return false;
    }
  }

  async useStickerOnSpot(userId, stickerId, spotId, position) {
    try {
      // Verify user owns the sticker
      const userStickers = await this.getUserStickers(userId);
      const sticker = userStickers.find(s => s.id === stickerId);
      
      if (!sticker) {
        throw new Error('Sticker not owned by user');
      }

      const stickerPlacement = {
        stickerId,
        userId,
        spotId,
        position: {
          x: position.x,
          y: position.y,
          scale: position.scale || 1,
          rotation: position.rotation || 0
        },
        message: position.message || '',
        isVisible: true,
        placedAt: new Date(),
        votes: {
          likes: 0,
          dislikes: 0,
          reports: 0
        },
        interactions: []
      };

      const placementRef = await addDoc(collection(db, 'spotStickers'), stickerPlacement);

      // Update sticker usage count
      await this.updateStickerUsage(userId, stickerId);

      // Check for spot badge achievements
      await this.checkSpotBadgeAchievements(userId, spotId);

      analyticsService.logEvent('sticker_placed_on_spot', {
        category: EventCategory.SOCIAL,
        user_id: userId,
        sticker_id: stickerId,
        spot_id: spotId
      });

      return { id: placementRef.id, ...stickerPlacement };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'use_sticker_on_spot'
      });
      throw new Error('Failed to place sticker');
    }
  }

  async getSpotStickers(spotId, limit = 50) {
    try {
      const q = query(
        collection(db, 'spotStickers'),
        where('spotId', '==', spotId),
        where('isVisible', '==', true),
        orderBy('placedAt', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(q);
      const stickers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Get sticker details for each placement
      const stickersWithDetails = await Promise.all(
        stickers.map(async (placement) => {
          const stickerDetails = await this.getStickerDetails(placement.stickerId);
          return {
            ...placement,
            stickerDetails
          };
        })
      );

      return stickersWithDetails;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'get_spot_stickers'
      });
      return [];
    }
  }

  // Spot Badge System
  async createSpotBadge(spotId, badgeData) {
    try {
      const badge = {
        spotId,
        name: badgeData.name,
        description: badgeData.description,
        icon: badgeData.icon,
        rarity: badgeData.rarity || 'common',
        requirements: {
          type: badgeData.requirementType, // visits, tricks, time_spent, community
          value: badgeData.requirementValue,
          timeframe: badgeData.timeframe, // daily, weekly, monthly, all_time
          conditions: badgeData.conditions || []
        },
        rewards: {
          coins: badgeData.coinReward || 0,
          xp: badgeData.xpReward || 0,
          stickerPack: badgeData.stickerPackReward,
          title: badgeData.titleReward
        },
        stats: {
          totalEarned: 0,
          uniqueEarners: 0,
          firstEarned: null,
          lastEarned: null
        },
        isActive: true,
        createdAt: new Date()
      };

      const badgeRef = await addDoc(collection(db, 'spotBadges'), badge);
      
      analyticsService.logEvent('spot_badge_created', {
        category: EventCategory.ACHIEVEMENT,
        spot_id: spotId,
        badge_id: badgeRef.id,
        rarity: badge.rarity,
        requirement_type: badge.requirements.type
      });

      return { id: badgeRef.id, ...badge };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'create_spot_badge'
      });
      throw new Error('Failed to create spot badge');
    }
  }

  async checkSpotBadgeAchievements(userId, spotId) {
    try {
      const spotBadges = await this.getSpotBadges(spotId);
      const userActivity = await this.getUserSpotActivity(userId, spotId);
      const newBadges = [];

      for (const badge of spotBadges) {
        const hasEarned = await this.hasUserEarnedBadge(userId, badge.id);
        
        if (!hasEarned && this.checkBadgeRequirement(badge, userActivity)) {
          const earnedBadge = await this.awardBadgeToUser(userId, badge.id);
          newBadges.push(earnedBadge);
        }
      }

      return newBadges;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'check_spot_badge_achievements'
      });
      return [];
    }
  }

  checkBadgeRequirement(badge, userActivity) {
    const { type, value, timeframe } = badge.requirements;
    
    switch (type) {
      case 'visits':
        return userActivity.totalVisits >= value;
      
      case 'tricks':
        return userActivity.tricksLanded >= value;
      
      case 'time_spent':
        return userActivity.totalTimeSpent >= value;
      
      case 'community':
        return (userActivity.stickersPlaced + userActivity.commentsPosted) >= value;
      
      case 'consecutive_days':
        return userActivity.consecutiveVisitDays >= value;
      
      default:
        return false;
    }
  }

  async awardBadgeToUser(userId, badgeId) {
    try {
      const badge = await this.getSpotBadge(badgeId);
      
      if (!badge) {
        throw new Error('Badge not found');
      }

      const earnedBadge = {
        userId,
        badgeId,
        spotId: badge.spotId,
        earnedAt: new Date(),
        notified: false
      };

      await addDoc(collection(db, 'earnedBadges'), earnedBadge);

      // Award rewards
      if (badge.rewards.coins > 0) {
        await this.updateUserCoins(userId, badge.rewards.coins);
      }

      if (badge.rewards.xp > 0) {
        await this.updateUserXP(userId, badge.rewards.xp);
      }

      if (badge.rewards.stickerPack) {
        await this.grantStickerPack(userId, badge.rewards.stickerPack);
      }

      // Update badge stats
      await this.updateBadgeStats(badgeId);

      analyticsService.logEvent('badge_earned', {
        category: EventCategory.ACHIEVEMENT,
        user_id: userId,
        badge_id: badgeId,
        spot_id: badge.spotId,
        rarity: badge.rarity
      });

      return { id: earnedBadge.id, ...earnedBadge, badge };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'award_badge_to_user'
      });
      throw new Error('Failed to award badge');
    }
  }

  // Achievement System
  async createGlobalAchievement(achievementData) {
    try {
      const achievement = {
        name: achievementData.name,
        description: achievementData.description,
        category: achievementData.category, // tricks, social, exploration, challenges
        icon: achievementData.icon,
        rarity: achievementData.rarity,
        requirements: achievementData.requirements,
        rewards: achievementData.rewards,
        isSecret: achievementData.isSecret || false,
        stats: {
          totalEarned: 0,
          firstEarned: null,
          percentage: 0
        },
        isActive: true,
        createdAt: new Date()
      };

      const achievementRef = await addDoc(collection(db, 'globalAchievements'), achievement);
      return { id: achievementRef.id, ...achievement };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'create_global_achievement'
      });
      throw new Error('Failed to create achievement');
    }
  }

  async getUserAchievements(userId) {
    try {
      const q = query(
        collection(db, 'earnedBadges'),
        where('userId', '==', userId),
        orderBy('earnedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const earnedBadges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Get badge details
      const badgesWithDetails = await Promise.all(
        earnedBadges.map(async (earned) => {
          const badge = await this.getSpotBadge(earned.badgeId);
          return {
            ...earned,
            badge
          };
        })
      );

      return badgesWithDetails;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'get_user_achievements'
      });
      return [];
    }
  }

  // Sticker Marketplace
  async createStickerMarketplace() {
    try {
      const marketplace = {
        featured: await this.getFeaturedStickers(),
        trending: await this.getTrendingStickers(),
        newReleases: await this.getNewReleaseStickers(),
        categories: await this.getStickerCategories(),
        creators: await this.getTopStickerCreators()
      };

      return marketplace;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'sticker_badge',
        action: 'create_sticker_marketplace'
      });
      return {};
    }
  }

  async getFeaturedStickers() {
    try {
      const q = query(
        collection(db, 'stickerPacks'),
        where('status', '==', 'active'),
        orderBy('stats.purchased', 'desc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }

  async getTrendingStickers() {
    try {
      // Get packs purchased in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const q = query(
        collection(db, 'stickerPurchases'),
        where('purchasedAt', '>=', sevenDaysAgo)
      );

      const snapshot = await getDocs(q);
      const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Count purchases per pack
      const packCounts = new Map();
      purchases.forEach(purchase => {
        const count = packCounts.get(purchase.packId) || 0;
        packCounts.set(purchase.packId, count + 1);
      });

      // Get top packs
      const trendingPackIds = Array.from(packCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(entry => entry[0]);

      const trendingPacks = await Promise.all(
        trendingPackIds.map(packId => this.getStickerPack(packId))
      );

      return trendingPacks.filter(pack => pack !== null);
    } catch (error) {
      return [];
    }
  }

  // Utility Functions
  calculateAverageRarity(stickers) {
    if (!stickers || stickers.length === 0) return 'common';
    
    const rarityValues = { common: 1, rare: 2, epic: 3, legendary: 4 };
    const averageValue = stickers.reduce((sum, sticker) => 
      sum + (rarityValues[sticker.rarity] || 1), 0
    ) / stickers.length;

    if (averageValue >= 3.5) return 'legendary';
    if (averageValue >= 2.5) return 'epic';
    if (averageValue >= 1.5) return 'rare';
    return 'common';
  }

  async getStickerPack(packId) {
    try {
      const packRef = doc(db, 'stickerPacks', packId);
      const packSnap = await getDoc(packRef);
      return packSnap.exists() ? { id: packSnap.id, ...packSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async getSpotBadge(badgeId) {
    try {
      const badgeRef = doc(db, 'spotBadges', badgeId);
      const badgeSnap = await getDoc(badgeRef);
      return badgeSnap.exists() ? { id: badgeSnap.id, ...badgeSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async getUserStickers(userId) {
    try {
      const userRef = doc(db, 'userStickers', userId);
      const userSnap = await getDoc(userRef);
      return userSnap.exists() ? userSnap.data().stickers || [] : [];
    } catch (error) {
      return [];
    }
  }

  async getUserProfile(userId) {
    try {
      const profileRef = doc(db, 'userProfiles', userId);
      const profileSnap = await getDoc(profileRef);
      return profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : {};
    } catch (error) {
      return {};
    }
  }

  async updateUserCoins(userId, amount) {
    try {
      const profileRef = doc(db, 'userProfiles', userId);
      const profile = await getDoc(profileRef);
      
      if (profile.exists()) {
        const currentCoins = profile.data().coins || 0;
        await updateDoc(profileRef, {
          coins: Math.max(0, currentCoins + amount),
          updatedAt: new Date()
        });
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateUserXP(userId, amount) {
    try {
      const profileRef = doc(db, 'userProfiles', userId);
      const profile = await getDoc(profileRef);
      
      if (profile.exists()) {
        const currentXP = profile.data().xp || 0;
        await updateDoc(profileRef, {
          xp: currentXP + amount,
          updatedAt: new Date()
        });
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default new StickerBadgeService();
