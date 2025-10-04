import { db, auth } from './firebase';
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
  GeoPoint
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class IRLDigitalIntegrationService {
  constructor() {
    this.userLocation = null;
    this.activeGeofences = new Map();
    this.locationWatchers = new Map();
    this.spotCheckIns = new Map();
  }

  // GEOFENCED SPOTS & SHOPS

  async initializeGeofencedSpots() {
    const spots = [
      // ICONIC SKATE SHOPS
      {
        id: 'supreme_ny',
        name: 'Supreme NYC',
        type: 'skate_shop',
        verified: true,
        location: new GeoPoint(40.7218, -74.0018), // SoHo
        radius: 50, // meters
        perks: {
          exclusive_gear: ['supreme_collab_deck', 'nyc_exclusive_tee'],
          hubba_bucks_bonus: 500,
          xp_multiplier: 2.0,
          check_in_rewards: ['supreme_sticker_pack', 'nyc_spot_badge']
        },
        requirements: {
          min_level: 5,
          daily_limit: 1,
          verification_required: true
        },
        shop_info: {
          address: '274 Lafayette St, New York, NY',
          hours: '11AM-7PM Mon-Sat, 12PM-6PM Sun',
          website: 'supremenewyork.com',
          phone: '(212) 966-7799'
        }
      },
      
      // LEGENDARY SKATE SPOTS
      {
        id: 'emb_sf',
        name: 'EMB (Embarcadero)',
        type: 'legendary_spot',
        verified: true,
        location: new GeoPoint(37.7955, -122.3933), // San Francisco
        radius: 100,
        perks: {
          exclusive_gear: ['emb_vintage_deck', 'pier_7_wheels'],
          hubba_bucks_bonus: 750,
          xp_multiplier: 3.0,
          trick_xp_bonus: 2.0,
          historical_badge: 'emb_og_badge'
        },
        spot_info: {
          era: '1990s',
          famous_for: 'Birth of modern street skating',
          legendary_skaters: ['Mark Gonzales', 'Mike Carroll', 'Henry Sanchez'],
          tricks_pioneered: ['Ledge tricks', 'Technical street']
        }
      },

      {
        id: 'love_park_philly',
        name: 'Love Park (LOVE Sculpture)',
        type: 'legendary_spot',
        verified: true,
        location: new GeoPoint(39.9542, -75.1657), // Philadelphia
        radius: 75,
        perks: {
          exclusive_gear: ['love_park_deck', 'philly_grit_grip'],
          hubba_bucks_bonus: 600,
          xp_multiplier: 2.5,
          historical_badge: 'love_park_legend'
        },
        spot_info: {
          era: '1990s-2000s',
          famous_for: 'East Coast street mecca',
          status: 'Historic (skating banned)',
          legacy: 'Shaped a generation of street skaters'
        }
      },

      // LOCAL SKATE SHOPS
      {
        id: 'local_shop_template',
        name: 'Independent Skate Shop',
        type: 'local_shop',
        verified: false,
        location: null, // Template for shop owners to customize
        radius: 30,
        perks: {
          hubba_bucks_bonus: 200,
          xp_multiplier: 1.5,
          local_support_badge: true,
          shop_loyalty_points: 10
        },
        shop_owner_benefits: {
          custom_gear_drops: true,
          event_hosting: true,
          community_features: true,
          analytics_access: true
        }
      },

      // SKATE PARKS
      {
        id: 'venice_skate_park',
        name: 'Venice Skate Park',
        type: 'skate_park',
        verified: true,
        location: new GeoPoint(33.9850, -118.4695), // Venice Beach
        radius: 150,
        perks: {
          exclusive_gear: ['venice_bowl_deck', 'dogtown_tribute_wheels'],
          hubba_bucks_bonus: 400,
          bowl_xp_bonus: 2.0,
          venice_badge: 'dogtown_disciple'
        },
        park_info: {
          type: 'Bowl/Street hybrid',
          famous_for: 'Dogtown legacy, Z-Boys history',
          best_time: 'Early morning or sunset'
        }
      },

      // DIY SPOTS
      {
        id: 'fdr_skate_park',
        name: 'FDR Skate Park',
        type: 'diy_spot',
        verified: true,
        location: new GeoPoint(39.9442, -75.1420), // Philadelphia
        radius: 80,
        perks: {
          exclusive_gear: ['diy_concrete_deck', 'fdr_bowl_wheels'],
          hubba_bucks_bonus: 300,
          diy_xp_bonus: 1.8,
          community_badge: 'concrete_warrior'
        },
        diy_info: {
          built_by: 'Skater community',
          features: 'Concrete bowls, street course',
          vibe: 'Raw, authentic, community-driven'
        }
      }
    ];

    // Initialize spots in database
    for (const spot of spots) {
      await this.createGeofencedSpot(spot);
    }

    return { success: true, spotsCreated: spots.length };
  }

  async createGeofencedSpot(spotData) {
    try {
      const spot = {
        ...spotData,
        createdAt: serverTimestamp(),
        activeUsers: 0,
        totalCheckIns: 0,
        dailyCheckIns: 0,
        lastActivity: null,
        events: [],
        leaderboard: {
          daily: [],
          weekly: [],
          allTime: []
        }
      };

      await addDoc(collection(db, 'geofencedSpots'), spot);
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // LOCATION TRACKING & CHECK-INS

  async startLocationTracking(userId) {
    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => this.handleLocationUpdate(userId, position),
        (error) => this.handleLocationError(error),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000 // 30 seconds
        }
      );

      this.locationWatchers.set(userId, watchId);
      
      analyticsService.logEvent('location_tracking_started', {
        category: EventCategory.LOCATION,
        user_id: userId
      });

      return { success: true, watchId };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'irl_digital_integration',
        action: 'start_location_tracking'
      });
      throw error;
    }
  }

  async handleLocationUpdate(userId, position) {
    try {
      const { latitude, longitude } = position.coords;
      this.userLocation = { latitude, longitude, accuracy: position.coords.accuracy };

      // Check if user is near any geofenced spots
      const nearbySpots = await this.checkNearbySpots(latitude, longitude);
      
      for (const spot of nearbySpots) {
        await this.handleSpotProximity(userId, spot);
      }

      // Update user's current location in real-time sessions
      await this.updateUserLocationInSessions(userId, this.userLocation);

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'irl_digital_integration',
        action: 'handle_location_update'
      });
    }
  }

  async checkNearbySpots(latitude, longitude) {
    try {
      // Get all geofenced spots (in production, use spatial queries)
      const spotsQuery = query(collection(db, 'geofencedSpots'));
      const spotsSnapshot = await getDocs(spotsQuery);
      
      const nearbySpots = [];
      
      spotsSnapshot.forEach(doc => {
        const spot = { id: doc.id, ...doc.data() };
        const distance = this.calculateDistance(
          latitude, 
          longitude, 
          spot.location.latitude, 
          spot.location.longitude
        );
        
        if (distance <= spot.radius) {
          nearbySpots.push({ ...spot, distanceFromUser: distance });
        }
      });

      return nearbySpots;
    } catch (error) {
      return [];
    }
  }

  async handleSpotProximity(userId, spot) {
    try {
      const checkInKey = `${userId}_${spot.id}`;
      const lastCheckIn = this.spotCheckIns.get(checkInKey);
      const now = new Date();
      
      // Prevent spam check-ins (min 1 hour between same spot)
      if (lastCheckIn && (now - lastCheckIn) < 3600000) {
        return;
      }

      // Trigger spot perks
      await this.triggerSpotPerks(userId, spot);
      
      // Record check-in
      this.spotCheckIns.set(checkInKey, now);
      
      // Send notification to user
      await this.sendSpotNotification(userId, spot);

    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'irl_digital_integration',
        action: 'handle_spot_proximity'
      });
    }
  }

  async triggerSpotPerks(userId, spot) {
    try {
      const perks = spot.perks;
      const rewards = [];

      return await runTransaction(db, async (transaction) => {
        // Get user profile
        const userRef = doc(db, 'userProfiles', userId);
        const userSnap = await transaction.get(userRef);
        
        if (!userSnap.exists()) {
          throw new Error('User not found');
        }

        const userData = userSnap.data();

        // Apply Hubba Bucks bonus
        if (perks.hubba_bucks_bonus) {
          const newBalance = (userData.hubbaBucks || 0) + perks.hubba_bucks_bonus;
          transaction.update(userRef, { hubbaBucks: newBalance });
          rewards.push({
            type: 'hubba_bucks',
            amount: perks.hubba_bucks_bonus,
            message: `+${perks.hubba_bucks_bonus} Hubba Bucks for visiting ${spot.name}!`
          });
        }

        // Apply XP with multiplier
        if (perks.xp_multiplier && perks.xp_multiplier > 1) {
          const baseXP = 100; // Base XP for spot visit
          const bonusXP = Math.round(baseXP * (perks.xp_multiplier - 1));
          const newXP = (userData.totalXP || 0) + baseXP + bonusXP;
          transaction.update(userRef, { totalXP: newXP });
          rewards.push({
            type: 'xp_bonus',
            amount: bonusXP,
            message: `${perks.xp_multiplier}x XP multiplier active at ${spot.name}!`
          });
        }

        // Grant exclusive gear
        if (perks.exclusive_gear && perks.exclusive_gear.length > 0) {
          for (const gearId of perks.exclusive_gear) {
            await this.grantExclusiveGear(userId, gearId, spot.id, transaction);
            rewards.push({
              type: 'exclusive_gear',
              gearId,
              message: `Unlocked exclusive gear: ${gearId}!`
            });
          }
        }

        // Grant badges
        if (perks.check_in_rewards) {
          for (const badgeId of perks.check_in_rewards) {
            await this.grantLocationBadge(userId, badgeId, spot.id, transaction);
            rewards.push({
              type: 'badge',
              badgeId,
              message: `Earned badge: ${badgeId}!`
            });
          }
        }

        // Record check-in
        const checkIn = {
          userId,
          spotId: spot.id,
          spotName: spot.name,
          spotType: spot.type,
          checkedInAt: serverTimestamp(),
          perksReceived: rewards,
          location: new GeoPoint(this.userLocation.latitude, this.userLocation.longitude)
        };

        transaction.set(doc(collection(db, 'spotCheckIns')), checkIn);

        analyticsService.logEvent('spot_check_in', {
          category: EventCategory.LOCATION,
          user_id: userId,
          spot_id: spot.id,
          spot_type: spot.type,
          rewards_count: rewards.length
        });

        return rewards;
      });

    } catch (error) {
      throw error;
    }
  }

  // SHOP INTEGRATION

  async enableShopOwnerMode(userId, shopData) {
    try {
      const {
        shopName,
        address,
        coordinates,
        businessLicense,
        contactInfo,
        socialMedia
      } = shopData;

      const shopProfile = {
        ownerId: userId,
        shopName,
        address,
        location: new GeoPoint(coordinates.latitude, coordinates.longitude),
        businessInfo: {
          license: businessLicense,
          verified: false, // Requires manual verification
          establishedDate: new Date(),
          contactInfo,
          socialMedia
        },
        features: {
          customGearDrops: true,
          eventHosting: true,
          loyaltyProgram: true,
          inventoryManagement: true,
          analytics: true
        },
        stats: {
          totalCustomers: 0,
          digitalSales: 0,
          eventsHosted: 0,
          communityRating: 0
        },
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'shopProfiles'), shopProfile);

      // Create geofenced spot for the shop
      await this.createGeofencedSpot({
        id: `shop_${docRef.id}`,
        name: shopName,
        type: 'local_shop',
        verified: false,
        location: new GeoPoint(coordinates.latitude, coordinates.longitude),
        radius: 30,
        perks: {
          hubba_bucks_bonus: 200,
          xp_multiplier: 1.5,
          shop_loyalty_points: 10
        },
        shopId: docRef.id,
        ownerId: userId
      });

      analyticsService.logEvent('shop_owner_mode_enabled', {
        category: EventCategory.BUSINESS,
        user_id: userId,
        shop_id: docRef.id
      });

      return { success: true, shopId: docRef.id };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'irl_digital_integration',
        action: 'enable_shop_owner_mode'
      });
      throw error;
    }
  }

  async createCustomShopDrop(shopId, dropData) {
    try {
      const {
        items,
        dropName,
        description,
        startTime,
        endTime,
        localOnly = true,
        maxDistance = 5000 // 5km radius
      } = dropData;

      const customDrop = {
        shopId,
        dropName,
        description,
        items,
        startTime,
        endTime,
        restrictions: {
          localOnly,
          maxDistance,
          requiresShopVisit: localOnly
        },
        stats: {
          totalViews: 0,
          totalSales: 0,
          uniqueCustomers: 0
        },
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'customShopDrops'), customDrop);

      // Create collectible items for the drop
      for (const item of items) {
        await this.createCustomCollectible(item, shopId, docRef.id);
      }

      return { success: true, dropId: docRef.id };
    } catch (error) {
      throw error;
    }
  }

  // REAL-WORLD COLLABORATION SYSTEM

  async initiateBrandCollaboration(brandData) {
    try {
      const collaboration = {
        brandName: brandData.brandName,
        contactInfo: brandData.contactInfo,
        collaborationType: brandData.type, // 'gear_drop', 'event_sponsor', 'shop_partnership'
        proposedItems: brandData.proposedItems || [],
        targetAudience: brandData.targetAudience || 'all',
        duration: brandData.duration || '30_days',
        status: 'pending_review',
        submittedAt: serverTimestamp(),
        requirements: {
          brandVerification: true,
          legalAgreement: true,
          contentApproval: true
        }
      };

      const docRef = await addDoc(collection(db, 'brandCollaborations'), collaboration);

      analyticsService.logEvent('brand_collaboration_initiated', {
        category: EventCategory.BUSINESS,
        brand_name: brandData.brandName,
        collaboration_type: brandData.type
      });

      return { success: true, collaborationId: docRef.id };
    } catch (error) {
      throw error;
    }
  }

  // AR INTEGRATION

  async generateARAvatar(userId, spotId) {
    try {
      // Get user's current avatar and equipped gear
      const avatar = await this.getUserAvatar(userId);
      const spot = await this.getSpotInfo(spotId);

      const arData = {
        avatarModel: {
          baseModel: avatar.model,
          equippedGear: avatar.gearDetails,
          animations: ['idle', 'trick_preview', 'wave'],
          scale: 1.0,
          positioning: 'surface_tracking'
        },
        spotInfo: {
          name: spot.name,
          coordinates: spot.location,
          environmentType: spot.type // affects lighting/shadows
        },
        effects: {
          rarityAura: avatar.rarityEffects,
          environmentIntegration: true,
          realWorldLighting: true,
          shadowCasting: true
        },
        sharing: {
          platforms: ['instagram', 'tiktok', 'snapchat'],
          hashtagSuggestions: [`#SkateHubba`, `#${spot.name.replace(/\s+/g, '')}`],
          filters: ['skate_style', 'urban_glow', 'vintage_film']
        }
      };

      analyticsService.logEvent('ar_avatar_generated', {
        category: EventCategory.AR,
        user_id: userId,
        spot_id: spotId,
        equipped_gear_count: Object.keys(avatar.gearDetails).length
      });

      return arData;
    } catch (error) {
      throw error;
    }
  }

  // CHALLENGE SYSTEM

  /**
   * Send a challenge to another skater
   * @param {Object} challengeData - Challenge information
   * @param {Object} challengeData.skater - Target skater info
   * @param {string} challengeData.gameType - Type of challenge (skate, line, custom)
   * @param {string} challengeData.message - Optional message
   * @param {string} challengeData.timestamp - Challenge timestamp
   */
  async sendChallenge(challengeData) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to send challenges');
      }

      const challenge = {
        id: `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        challengerId: currentUser.uid,
        challengerUsername: currentUser.displayName || 'Anonymous Skater',
        targetId: challengeData.skater.id,
        targetUsername: challengeData.skater.username,
        gameType: challengeData.gameType,
        message: challengeData.message,
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        location: this.userLocation,
        metadata: {
          challengerLevel: challengeData.skater.level || 1,
          targetLevel: challengeData.skater.level || 1,
          gameTypeDetails: this.getGameTypeDetails(challengeData.gameType)
        }
      };

      // Save to Firestore
      const challengeRef = await addDoc(collection(db, 'challenges'), challenge);
      
      // Send notification to target user
      await this.sendChallengeNotification(challenge);
      
      // Log analytics
      analyticsService.logEvent(EventCategory.SOCIAL, 'challenge_sent', {
        challengeId: challengeRef.id,
        gameType: challengeData.gameType,
        targetUserId: challengeData.skater.id
      });

      console.log('Challenge sent successfully:', challengeRef.id);
      return { success: true, challengeId: challengeRef.id };

    } catch (error) {
      GlobalErrorHandler.handleError(error, 'sendChallenge');
      throw error;
    }
  }

  /**
   * Get details for different game types
   */
  getGameTypeDetails(gameType) {
    const gameTypes = {
      skate: {
        name: 'Game of SKATE',
        description: 'Letter-based elimination challenge',
        rules: 'Players take turns attempting tricks. Miss a trick and get a letter!',
        duration: '10-30 minutes',
        difficulty: 'Medium'
      },
      line: {
        name: 'Best Line',
        description: 'Best trick sequence wins',
        rules: 'Film your best line at the spot. Most creative/technical wins!',
        duration: '15-45 minutes',
        difficulty: 'Hard'
      },
      custom: {
        name: 'Custom Challenge',
        description: 'Create your own rules',
        rules: 'Anything goes! Set your own challenge parameters.',
        duration: 'Variable',
        difficulty: 'Variable'
      }
    };

    return gameTypes[gameType] || gameTypes.skate;
  }

  /**
   * Send push notification for challenge
   */
  async sendChallengeNotification(challenge) {
    try {
      // In a real app, you'd use Firebase Cloud Messaging or similar
      const notificationData = {
        userId: challenge.targetId,
        type: 'challenge_received',
        title: '🛹 New Challenge!',
        body: `${challenge.challengerUsername} challenged you to ${challenge.metadata.gameTypeDetails.name}!`,
        data: {
          challengeId: challenge.id,
          challengerId: challenge.challengerId,
          gameType: challenge.gameType
        },
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'notifications'), notificationData);
      console.log('Challenge notification sent');
    } catch (error) {
      console.warn('Failed to send challenge notification:', error);
    }
  }

  /**
   * Accept a challenge
   */
  async acceptChallenge(challengeId) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to accept challenges');
      }

      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        gameSession: {
          status: 'active',
          startedAt: serverTimestamp(),
          currentTurn: 'challenger', // challenger goes first
          moves: []
        }
      });

      analyticsService.logEvent(EventCategory.SOCIAL, 'challenge_accepted', {
        challengeId
      });

      return { success: true };
    } catch (error) {
      GlobalErrorHandler.handleError(error, 'acceptChallenge');
      throw error;
    }
  }

  /**
   * Decline a challenge
   */
  async declineChallenge(challengeId) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to decline challenges');
      }

      await updateDoc(doc(db, 'challenges', challengeId), {
        status: 'declined',
        declinedAt: serverTimestamp()
      });

      analyticsService.logEvent(EventCategory.SOCIAL, 'challenge_declined', {
        challengeId
      });

      return { success: true };
    } catch (error) {
      GlobalErrorHandler.handleError(error, 'declineChallenge');
      throw error;
    }
  }

  /**
   * Get challenges for current user (sent and received)
   */
  async getUserChallenges(limit = 20) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { sent: [], received: [] };
      }

      // Get challenges sent by user
      const sentQuery = query(
        collection(db, 'challenges'),
        where('challengerId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(limit)
      );

      // Get challenges received by user
      const receivedQuery = query(
        collection(db, 'challenges'),
        where('targetId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(limit)
      );

      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(sentQuery),
        getDocs(receivedQuery)
      ]);

      const sent = sentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const received = receivedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return { sent, received };
    } catch (error) {
      GlobalErrorHandler.handleError(error, 'getUserChallenges');
      throw error;
    }
  }

  // ...existing code...

  // UTILITY FUNCTIONS

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  async grantExclusiveGear(userId, gearId, spotId, transaction) {
    // Grant location-exclusive gear
    const gearGrant = {
      userId,
      gearId,
      grantedAt: serverTimestamp(),
      source: 'location_exclusive',
      spotId,
      rarity: 'location_exclusive'
    };

    transaction.set(doc(collection(db, 'exclusiveGearGrants')), gearGrant);
  }

  async grantLocationBadge(userId, badgeId, spotId, transaction) {
    const badge = {
      userId,
      badgeId,
      earnedAt: serverTimestamp(),
      source: 'spot_check_in',
      spotId,
      category: 'location'
    };

    transaction.set(doc(collection(db, 'userBadges')), badge);
  }

  async sendSpotNotification(userId, spot) {
    const notification = {
      userId,
      type: 'spot_proximity',
      title: `Welcome to ${spot.name}! 🛹`,
      message: `You're at a legendary spot! Check in to unlock exclusive rewards.`,
      data: {
        spotId: spot.id,
        spotType: spot.type,
        perksAvailable: Object.keys(spot.perks).length
      },
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), notification);
  }

  async updateUserLocationInSessions(userId, location) {
    // Update user location in any active sessions for proximity features
    const sessionsQuery = query(
      collection(db, 'skateSessions'),
      where('participants', 'array-contains', userId),
      where('status', '==', 'active')
    );

    const sessionsSnapshot = await getDocs(sessionsQuery);
    
    sessionsSnapshot.forEach(async (doc) => {
      await updateDoc(doc.ref, {
        [`participantLocations.${userId}`]: {
          coordinates: new GeoPoint(location.latitude, location.longitude),
          lastUpdated: serverTimestamp(),
          accuracy: location.accuracy
        }
      });
    });
  }

  async getUserAvatar(userId) {
    // Simplified - would integrate with avatar system
    return {
      model: '/assets/avatar/user_model.obj',
      gearDetails: {},
      rarityEffects: []
    };
  }

  async getSpotInfo(spotId) {
    const spotRef = doc(db, 'geofencedSpots', spotId);
    const spotSnap = await getDoc(spotRef);
    return spotSnap.exists() ? { id: spotSnap.id, ...spotSnap.data() } : null;
  }

  async createCustomCollectible(itemData, shopId, dropId) {
    const collectible = {
      ...itemData,
      shopId,
      dropId,
      type: 'shop_exclusive',
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'collectableItems'), collectible);
  }

  handleLocationError(error) {
    console.warn('Location error:', error.message);
    analyticsService.logEvent('location_error', {
      category: EventCategory.LOCATION,
      error_code: error.code,
      error_message: error.message
    });
  }

  stopLocationTracking(userId) {
    const watchId = this.locationWatchers.get(userId);
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      this.locationWatchers.delete(userId);
    }
  }

  cleanup() {
    // Stop all location tracking
    this.locationWatchers.forEach(watchId => {
      navigator.geolocation.clearWatch(watchId);
    });
    this.locationWatchers.clear();
    this.activeGeofences.clear();
    this.spotCheckIns.clear();
  }
}

export default new IRLDigitalIntegrationService();
