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
import CurrencyProgressionService from './currencyProgressionService';

class DigitalGearService {
  constructor() {
    this.activeDrops = new Map();
    this.userCollections = new Map();
    this.tradingBoard = new Map();
    this.gearCatalog = new Map();
    this.serialNumbers = new Map();
  }

  // I. DIGITAL COLLECTABLES SHOP

  async createCollectableItem(itemData) {
    try {
      const item = {
        name: itemData.name,
        description: itemData.description,
        category: itemData.category, // 'decks', 'shoes', 'wheels', 'trucks', 'stickers', 'accessories'
        brand: itemData.brand, // 'Powell-Peralta', 'Silver', 'Independent', etc.
        model: itemData.model, // 'Koston 1s', 'Bones Reds', etc.
        year: itemData.year || new Date().getFullYear(),
        
        // Visual Assets
        imageUrl: itemData.imageUrl,
        model3DUrl: itemData.model3DUrl,
        thumbnailUrl: itemData.thumbnailUrl,
        animationUrl: itemData.animationUrl, // For special effects
        
        // Rarity & Production
        rarity: itemData.rarity, // 'common', 'rare', 'ultra_rare', 'legendary', 'mythic'
        totalProduction: itemData.totalProduction, // e.g., 100 for "X of 100"
        remainingStock: itemData.totalProduction,
        serialNumbers: [], // Will store assigned serial numbers
        
        // Pricing & Availability
        price: itemData.price, // Hubba Bucks only
        currency: 'hubba_bucks',
        
        // Drop Configuration
        dropType: itemData.dropType, // 'limited_time', 'first_come_first_served', 'scheduled'
        announceTime: itemData.announceTime,
        releaseTime: itemData.releaseTime,
        endTime: itemData.endTime,
        
        // Metadata
        tags: itemData.tags || [],
        collection: itemData.collection, // 'OG Classics', 'Pro Models', etc.
        isCollaborative: itemData.isCollaborative || false,
        collaborators: itemData.collaborators || [],
        
        // Status & Stats
        status: 'announced', // 'announced', 'live', 'sold_out', 'ended'
        totalSold: 0,
        firstOwner: null,
        lastSoldAt: null,
        
        // Social Features
        hypeLevel: 0,
        preOrderCount: 0,
        wishlistCount: 0,
        
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Generate serial number pool
      for (let i = 1; i <= item.totalProduction; i++) {
        item.serialNumbers.push({
          number: i,
          isAvailable: true,
          ownerId: null,
          purchaseHistory: []
        });
      }

      const itemRef = await addDoc(collection(db, 'collectableItems'), item);
      
      analyticsService.logEvent('collectable_item_created', {
        category: EventCategory.COLLECTIBLES,
        item_id: itemRef.id,
        item_name: item.name,
        rarity: item.rarity,
        total_production: item.totalProduction,
        price: item.price
      });

      return { id: itemRef.id, ...item };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'create_collectable_item'
      });
      throw new Error('Failed to create collectable item');
    }
  }

  // Pre-configured Iconic Items
  async initializeIconicItems() {
    const iconicItems = [
      {
        name: 'Koston 1s Original',
        description: 'The legendary Eric Koston signature shoe that changed street skating forever',
        category: 'shoes',
        brand: 'éS',
        model: 'Koston 1',
        year: 1999,
        rarity: 'legendary',
        totalProduction: 50,
        price: 5000,
        collection: 'OG Classics',
        tags: ['eric koston', 'street', 'legendary', '90s'],
        imageUrl: '/assets/collectibles/koston_1s.png'
      },
      {
        name: 'Powell-Peralta Bones Brigade',
        description: 'Vintage Bones Brigade deck from the golden era',
        category: 'decks',
        brand: 'Powell-Peralta',
        model: 'Bones Brigade',
        year: 1985,
        rarity: 'mythic',
        totalProduction: 25,
        price: 10000,
        collection: 'Vintage Legends',
        tags: ['vintage', 'bones brigade', 'powell peralta', '80s'],
        imageUrl: '/assets/collectibles/bones_brigade.png'
      },
      {
        name: 'Muska Silvers',
        description: 'Chad Muska signature Silver trucks - the sound of street skating',
        category: 'trucks',
        brand: 'Silver',
        model: 'Muska Pro',
        year: 1998,
        rarity: 'ultra_rare',
        totalProduction: 100,
        price: 3000,
        collection: 'Pro Models',
        tags: ['chad muska', 'silver trucks', 'street'],
        imageUrl: '/assets/collectibles/muska_silvers.png'
      },
      {
        name: 'Bones Super Reds',
        description: 'The bearings every skater dreams of',
        category: 'bearings',
        brand: 'Bones',
        model: 'Super Reds',
        year: 2000,
        rarity: 'rare',
        totalProduction: 200,
        price: 1500,
        collection: 'Essential Gear',
        tags: ['bones bearings', 'performance', 'classic'],
        imageUrl: '/assets/collectibles/super_reds.png'
      },
      {
        name: 'Baker Deathwish Sticker Pack',
        description: 'Rare sticker pack from the Baker/Deathwish era',
        category: 'stickers',
        brand: 'Baker',
        model: 'Deathwish Pack',
        year: 2008,
        rarity: 'ultra_rare',
        totalProduction: 75,
        price: 2500,
        collection: 'Street Culture',
        tags: ['baker', 'deathwish', 'stickers', 'street'],
        imageUrl: '/assets/collectibles/baker_stickers.png'
      }
    ];

    const createdItems = [];
    for (const itemData of iconicItems) {
      try {
        // Add drop timing (release in 1 hour)
        itemData.announceTime = new Date();
        itemData.releaseTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
        itemData.dropType = 'first_come_first_served';

        const item = await this.createCollectableItem(itemData);
        createdItems.push(item);
      } catch (error) {
        console.error('Failed to create iconic item:', itemData.name, error);
      }
    }

    return createdItems;
  }

  // II. LIMITED PRODUCTION, DROP MECHANICS & FOMO

  async purchaseCollectable(userId, itemId, preferredSerial = null) {
    try {
      return await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'collectableItems', itemId);
        const itemDoc = await transaction.get(itemRef);
        
        if (!itemDoc.exists()) {
          throw new Error('Item not found');
        }

        const item = itemDoc.data();

        // Check if drop is live
        if (item.status !== 'live') {
          throw new Error('Item is not available for purchase');
        }

        // Check if user already owns this item
        const userCollection = await this.getUserCollection(userId);
        const alreadyOwns = userCollection.some(owned => 
          owned.itemId === itemId
        );

        if (alreadyOwns) {
          throw new Error('You already own this item');
        }

        // Check if any serials are available
        const availableSerials = item.serialNumbers.filter(serial => serial.isAvailable);
        if (availableSerials.length === 0) {
          throw new Error('Item is sold out');
        }

        // Select serial number
        let selectedSerial;
        if (preferredSerial && availableSerials.find(s => s.number === preferredSerial)) {
          selectedSerial = availableSerials.find(s => s.number === preferredSerial);
        } else {
          // Random selection for fairness
          selectedSerial = availableSerials[Math.floor(Math.random() * availableSerials.length)];
        }

        // Check user has enough Hubba Bucks
        const userProfile = await CurrencyProgressionService.getUserProfile(userId);
        if (userProfile.hubbaBucks < item.price) {
          throw new Error('Insufficient Hubba Bucks');
        }

        // Process purchase
        await CurrencyProgressionService.spendHubbaBucks(userId, item.price, itemId, 'collectable_purchase');

        // Update serial number ownership
        const updatedSerials = item.serialNumbers.map(serial => {
          if (serial.number === selectedSerial.number) {
            return {
              ...serial,
              isAvailable: false,
              ownerId: userId,
              purchaseHistory: [
                ...serial.purchaseHistory,
                {
                  ownerId: userId,
                  purchaseDate: new Date(),
                  price: item.price,
                  source: 'primary_purchase'
                }
              ]
            };
          }
          return serial;
        });

        // Create ownership record
        const ownership = {
          userId,
          itemId,
          serialNumber: selectedSerial.number,
          rarity: item.rarity,
          purchaseDate: new Date(),
          purchasePrice: item.price,
          source: 'primary_purchase',
          isForTrade: false,
          displayOnProfile: true,
          itemDetails: {
            name: item.name,
            imageUrl: item.imageUrl,
            brand: item.brand,
            model: item.model,
            collection: item.collection
          }
        };

        await addDoc(collection(db, 'collectableOwnership'), ownership);

        // Update item
        transaction.update(itemRef, {
          serialNumbers: updatedSerials,
          remainingStock: item.remainingStock - 1,
          totalSold: item.totalSold + 1,
          lastSoldAt: new Date(),
          status: item.remainingStock - 1 === 0 ? 'sold_out' : 'live'
        });

        analyticsService.logEvent('collectable_purchased', {
          category: EventCategory.COLLECTIBLES,
          user_id: userId,
          item_id: itemId,
          serial_number: selectedSerial.number,
          price: item.price,
          rarity: item.rarity,
          remaining_stock: item.remainingStock - 1
        });

        // Send purchase notification
        await this.sendPurchaseNotification(userId, item, selectedSerial.number);

        return {
          success: true,
          ownership,
          serialNumber: selectedSerial.number,
          itemName: item.name,
          rarity: item.rarity
        };
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'purchase_collectable'
      });
      throw error;
    }
  }

  async scheduleDropAnnouncement(itemId, announcementData) {
    try {
      const announcement = {
        itemId,
        title: announcementData.title,
        message: announcementData.message,
        hypeText: announcementData.hypeText, // "Only 50 made! Don't miss out!"
        countdownEndTime: announcementData.releaseTime,
        pushNotification: {
          enabled: true,
          title: `🔥 ${announcementData.title}`,
          body: announcementData.message,
          scheduledFor: announcementData.notificationTime
        },
        socialMedia: {
          enabled: announcementData.enableSocialShare || false,
          platforms: ['instagram', 'tiktok', 'twitter']
        },
        targetAudience: announcementData.targetAudience || 'all', // 'all', 'collectors', 'vip'
        createdAt: new Date()
      };

      const announcementRef = await addDoc(collection(db, 'dropAnnouncements'), announcement);
      
      // Update item status
      const itemRef = doc(db, 'collectableItems', itemId);
      await updateDoc(itemRef, {
        status: 'announced',
        announcementId: announcementRef.id
      });

      return { id: announcementRef.id, ...announcement };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'schedule_drop_announcement'
      });
      throw new Error('Failed to schedule drop announcement');
    }
  }

  // III. COLLECTING & INVENTORY

  async getUserCollection(userId) {
    try {
      const q = query(
        collection(db, 'collectableOwnership'),
        where('userId', '==', userId),
        orderBy('purchaseDate', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'get_user_collection'
      });
      return [];
    }
  }

  async getCollectionStats(userId) {
    try {
      const collection = await this.getUserCollection(userId);
      
      const stats = {
        totalItems: collection.length,
        totalValue: collection.reduce((sum, item) => sum + (item.purchasePrice || 0), 0),
        rarityBreakdown: {},
        collections: {},
        brands: {},
        firstPurchase: collection.length > 0 ? collection[collection.length - 1].purchaseDate : null,
        latestPurchase: collection.length > 0 ? collection[0].purchaseDate : null,
        favoriteCategory: null
      };

      // Calculate rarity breakdown
      collection.forEach(item => {
        stats.rarityBreakdown[item.rarity] = (stats.rarityBreakdown[item.rarity] || 0) + 1;
        stats.collections[item.itemDetails.collection] = (stats.collections[item.itemDetails.collection] || 0) + 1;
        stats.brands[item.itemDetails.brand] = (stats.brands[item.itemDetails.brand] || 0) + 1;
      });

      // Find favorite category (most collected)
      const categories = Object.entries(stats.collections);
      if (categories.length > 0) {
        stats.favoriteCategory = categories.sort((a, b) => b[1] - a[1])[0][0];
      }

      return stats;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'get_collection_stats'
      });
      return {};
    }
  }

  async updateProfileDisplay(userId, itemOwnershipId, displaySettings) {
    try {
      const ownershipRef = doc(db, 'collectableOwnership', itemOwnershipId);
      await updateDoc(ownershipRef, {
        displayOnProfile: displaySettings.displayOnProfile,
        displayOrder: displaySettings.displayOrder || 0,
        showcaseMessage: displaySettings.showcaseMessage || '',
        updatedAt: new Date()
      });

      return true;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'update_profile_display'
      });
      return false;
    }
  }

  // IV. GEAR TRADING SYSTEM

  async createTradeOffer(userId, offerData) {
    try {
      // Verify user owns the offered item
      const userCollection = await this.getUserCollection(userId);
      const offeredItem = userCollection.find(item => 
        item.id === offerData.offeredItemOwnershipId
      );

      if (!offeredItem) {
        throw new Error('You do not own this item');
      }

      if (offeredItem.isForTrade) {
        throw new Error('Item is already listed for trade');
      }

      const tradeOffer = {
        offererId: userId,
        offeredItemOwnershipId: offerData.offeredItemOwnershipId,
        offeredItem: {
          name: offeredItem.itemDetails.name,
          serialNumber: offeredItem.serialNumber,
          rarity: offeredItem.rarity,
          imageUrl: offeredItem.itemDetails.imageUrl,
          brand: offeredItem.itemDetails.brand,
          model: offeredItem.itemDetails.model
        },
        
        // What they want in return
        requestType: offerData.requestType, // 'specific_item', 'any_rarity', 'any_collection', 'open_offers'
        requestedItemId: offerData.requestedItemId || null, // For specific item requests
        requestedRarity: offerData.requestedRarity || null, // For rarity-based requests
        requestedCollection: offerData.requestedCollection || null,
        
        // Trade details
        description: offerData.description || '',
        isPublic: offerData.isPublic !== false, // Default to public
        directTradeWith: offerData.directTradeWith || null, // For friend-to-friend trades
        
        // Status
        status: 'active', // 'active', 'pending', 'completed', 'cancelled'
        offers: [], // Counter-offers from other users
        
        // Timing
        expiresAt: offerData.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const tradeRef = await addDoc(collection(db, 'tradeOffers'), tradeOffer);

      // Mark item as for trade
      const ownershipRef = doc(db, 'collectableOwnership', offerData.offeredItemOwnershipId);
      await updateDoc(ownershipRef, {
        isForTrade: true,
        tradeOfferId: tradeRef.id
      });

      analyticsService.logEvent('trade_offer_created', {
        category: EventCategory.TRADING,
        user_id: userId,
        offered_item: offeredItem.itemDetails.name,
        serial_number: offeredItem.serialNumber,
        request_type: tradeOffer.requestType,
        is_public: tradeOffer.isPublic
      });

      return { id: tradeRef.id, ...tradeOffer };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'create_trade_offer'
      });
      throw error;
    }
  }

  async respondToTradeOffer(userId, tradeOfferId, responseData) {
    try {
      const tradeOffer = await this.getTradeOffer(tradeOfferId);
      if (!tradeOffer) {
        throw new Error('Trade offer not found');
      }

      if (tradeOffer.offererId === userId) {
        throw new Error('Cannot respond to your own trade offer');
      }

      if (tradeOffer.status !== 'active') {
        throw new Error('Trade offer is no longer active');
      }

      // Verify user owns the offered item for counter-trade
      const userCollection = await this.getUserCollection(userId);
      const counterOfferedItem = userCollection.find(item => 
        item.id === responseData.counterOfferedItemOwnershipId
      );

      if (!counterOfferedItem) {
        throw new Error('You do not own this item');
      }

      const response = {
        responderId: userId,
        counterOfferedItemOwnershipId: responseData.counterOfferedItemOwnershipId,
        counterOfferedItem: {
          name: counterOfferedItem.itemDetails.name,
          serialNumber: counterOfferedItem.serialNumber,
          rarity: counterOfferedItem.rarity,
          imageUrl: counterOfferedItem.itemDetails.imageUrl,
          brand: counterOfferedItem.itemDetails.brand,
          model: counterOfferedItem.itemDetails.model
        },
        message: responseData.message || '',
        responseType: responseData.responseType || 'counter_offer', // 'counter_offer', 'accept'
        createdAt: new Date()
      };

      // Add response to trade offer
      const tradeRef = doc(db, 'tradeOffers', tradeOfferId);
      await updateDoc(tradeRef, {
        offers: arrayUnion(response),
        updatedAt: new Date()
      });

      // Send notification to original offerer
      await this.sendTradeResponseNotification(tradeOffer.offererId, userId, tradeOffer, response);

      return response;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'respond_to_trade_offer'
      });
      throw error;
    }
  }

  async executeTrade(tradeOfferId, offererId, responderId, counterOfferId) {
    try {
      return await runTransaction(db, async (transaction) => {
        const tradeOffer = await this.getTradeOffer(tradeOfferId);
        const counterOffer = tradeOffer.offers.find(offer => 
          offer.responderId === responderId && offer.id === counterOfferId
        );

        if (!counterOffer) {
          throw new Error('Counter offer not found');
        }

        // Get ownership records
        const offererItemRef = doc(db, 'collectableOwnership', tradeOffer.offeredItemOwnershipId);
        const responderItemRef = doc(db, 'collectableOwnership', counterOffer.counterOfferedItemOwnershipId);

        // Update ownership
        transaction.update(offererItemRef, {
          userId: responderId,
          isForTrade: false,
          tradeOfferId: null,
          tradeHistory: arrayUnion({
            tradedWith: responderId,
            tradedFor: counterOffer.counterOfferedItem.name,
            tradeDate: new Date(),
            tradeType: 'user_trade'
          })
        });

        transaction.update(responderItemRef, {
          userId: offererId,
          isForTrade: false,
          tradeOfferId: null,
          tradeHistory: arrayUnion({
            tradedWith: offererId,
            tradedFor: tradeOffer.offeredItem.name,
            tradeDate: new Date(),
            tradeType: 'user_trade'
          })
        });

        // Update original collectible items' serial number ownership
        await this.updateSerialNumberOwnership(tradeOffer.offeredItem.itemId, tradeOffer.offeredItem.serialNumber, responderId);
        await this.updateSerialNumberOwnership(counterOffer.counterOfferedItem.itemId, counterOffer.counterOfferedItem.serialNumber, offererId);

        // Complete trade offer
        const tradeRef = doc(db, 'tradeOffers', tradeOfferId);
        transaction.update(tradeRef, {
          status: 'completed',
          completedAt: new Date(),
          acceptedOffer: counterOffer
        });

        // Create trade completion record
        const tradeRecord = {
          tradeOfferId,
          participant1: {
            userId: offererId,
            itemGiven: tradeOffer.offeredItem,
            itemReceived: counterOffer.counterOfferedItem
          },
          participant2: {
            userId: responderId,
            itemGiven: counterOffer.counterOfferedItem,
            itemReceived: tradeOffer.offeredItem
          },
          completedAt: new Date(),
          tradeType: 'user_trade'
        };

        await addDoc(collection(db, 'completedTrades'), tradeRecord);

        analyticsService.logEvent('trade_completed', {
          category: EventCategory.TRADING,
          trade_offer_id: tradeOfferId,
          participant1_id: offererId,
          participant2_id: responderId,
          item1_name: tradeOffer.offeredItem.name,
          item2_name: counterOffer.counterOfferedItem.name
        });

        // Send completion notifications
        await this.sendTradeCompletionNotifications(offererId, responderId, tradeRecord);

        return tradeRecord;
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'execute_trade'
      });
      throw error;
    }
  }

  async getTradingBoard(filters = {}) {
    try {
      let q = query(
        collection(db, 'tradeOffers'),
        where('status', '==', 'active'),
        where('isPublic', '==', true)
      );

      if (filters.rarity) {
        q = query(q, where('offeredItem.rarity', '==', filters.rarity));
      }

      if (filters.collection) {
        q = query(q, where('offeredItem.collection', '==', filters.collection));
      }

      q = query(q, orderBy('createdAt', 'desc'), limit(50));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'get_trading_board'
      });
      return [];
    }
  }

  // V. SCARCITY, COLLECTABILITY & FLEX

  async getItemProvenance(itemId, serialNumber) {
    try {
      const ownershipHistory = [];
      
      // Get current ownership
      const q = query(
        collection(db, 'collectableOwnership'),
        where('itemId', '==', itemId),
        where('serialNumber', '==', serialNumber)
      );

      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const ownership = snapshot.docs[0].data();
        ownershipHistory.push({
          owner: ownership.userId,
          fromDate: ownership.purchaseDate,
          toDate: null, // Current owner
          source: ownership.source,
          price: ownership.purchasePrice
        });

        // Get trade history
        if (ownership.tradeHistory) {
          ownership.tradeHistory.forEach(trade => {
            ownershipHistory.push({
              owner: trade.tradedWith,
              fromDate: trade.tradeDate,
              toDate: ownership.purchaseDate,
              source: 'trade',
              tradedFor: trade.tradedFor
            });
          });
        }
      }

      return ownershipHistory.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'get_item_provenance'
      });
      return [];
    }
  }

  async getCollectorLeaderboards() {
    try {
      const leaderboards = {
        topCollectors: await this.getTopCollectors(),
        mostTrades: await this.getMostActiveTraders(),
        firstToComplete: await this.getSetCompletionLeaders(),
        rarityHunters: await this.getRarityHunters(),
        newestCollectors: await this.getNewestCollectors()
      };

      return leaderboards;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'get_collector_leaderboards'
      });
      return {};
    }
  }

  async shareCollectionToSocial(userId, itemOwnershipId, platform) {
    try {
      const ownership = await getDoc(doc(db, 'collectableOwnership', itemOwnershipId));
      if (!ownership.exists() || ownership.data().userId !== userId) {
        throw new Error('Item not found or not owned by user');
      }

      const item = ownership.data();
      const shareData = {
        title: `Just scored ${item.itemDetails.name} #${item.serialNumber}!`,
        description: `Check out my rare ${item.rarity} collectible in SkateHubba! 🛹`,
        imageUrl: item.itemDetails.imageUrl,
        shareUrl: `https://skatehubba.com/collectible/${item.itemId}/${item.serialNumber}`,
        platform: platform,
        userId: userId,
        sharedAt: new Date()
      };

      await addDoc(collection(db, 'socialShares'), shareData);

      analyticsService.logEvent('collectible_shared', {
        category: EventCategory.SOCIAL,
        user_id: userId,
        item_name: item.itemDetails.name,
        serial_number: item.serialNumber,
        platform: platform
      });

      return shareData;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'share_collection_to_social'
      });
      throw error;
    }
  }

  // Utility Functions
  async getTradeOffer(tradeOfferId) {
    try {
      const tradeRef = doc(db, 'tradeOffers', tradeOfferId);
      const tradeSnap = await getDoc(tradeRef);
      return tradeSnap.exists() ? { id: tradeSnap.id, ...tradeSnap.data() } : null;
    } catch (error) {
      return null;
    }
  }

  async updateSerialNumberOwnership(itemId, serialNumber, newOwnerId) {
    try {
      const itemRef = doc(db, 'collectableItems', itemId);
      const itemDoc = await getDoc(itemRef);
      
      if (!itemDoc.exists()) return;

      const item = itemDoc.data();
      const updatedSerials = item.serialNumbers.map(serial => {
        if (serial.number === serialNumber) {
          return {
            ...serial,
            ownerId: newOwnerId,
            purchaseHistory: [
              ...serial.purchaseHistory,
              {
                ownerId: newOwnerId,
                transferDate: new Date(),
                source: 'trade'
              }
            ]
          };
        }
        return serial;
      });

      await updateDoc(itemRef, { serialNumbers: updatedSerials });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'update_serial_number_ownership'
      });
    }
  }

  async sendPurchaseNotification(userId, item, serialNumber) {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        type: 'collectable_purchase',
        title: `🎉 You scored ${item.name} #${serialNumber}!`,
        message: `Congratulations! You now own ${item.name} #${serialNumber}/${item.totalProduction}. This ${item.rarity} collectible is now in your collection!`,
        timestamp: new Date(),
        read: false,
        category: 'collectibles',
        metadata: {
          itemId: item.id,
          serialNumber: serialNumber,
          rarity: item.rarity
        }
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'send_purchase_notification'
      });
    }
  }

  async sendTradeCompletionNotifications(user1Id, user2Id, tradeRecord) {
    try {
      // Notification to participant 1
      await addDoc(collection(db, 'notifications'), {
        userId: user1Id,
        type: 'trade_completed',
        title: '🔄 Trade Complete!',
        message: `You successfully traded ${tradeRecord.participant1.itemGiven.name} for ${tradeRecord.participant1.itemReceived.name}!`,
        timestamp: new Date(),
        read: false,
        category: 'trading'
      });

      // Notification to participant 2
      await addDoc(collection(db, 'notifications'), {
        userId: user2Id,
        type: 'trade_completed',
        title: '🔄 Trade Complete!',
        message: `You successfully traded ${tradeRecord.participant2.itemGiven.name} for ${tradeRecord.participant2.itemReceived.name}!`,
        timestamp: new Date(),
        read: false,
        category: 'trading'
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'digital_gear',
        action: 'send_trade_completion_notifications'
      });
    }
  }

  async getTopCollectors() {
    // This would aggregate user collections and return top collectors
    // Simplified implementation
    return [];
  }

  async getMostActiveTraders() {
    // This would count completed trades per user
    return [];
  }

  async getSetCompletionLeaders() {
    // This would check who completed full collections first
    return [];
  }

  async getRarityHunters() {
    // This would rank users by rarest items owned
    return [];
  }

  async getNewestCollectors() {
    // This would show recent new collectors
    return [];
  }
}

export default new DigitalGearService();
