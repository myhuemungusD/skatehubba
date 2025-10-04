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
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import DigitalGearService from './digitalGearService';

class FirstRareDropService {
  constructor() {
    this.dropId = 'first_rare_drop_2025';
    this.dropName = 'OG Legends Collection';
    this.dropDescription = 'The most iconic pieces from skateboarding\'s golden era';
    this.dropStartTime = new Date('2025-07-20T12:00:00Z'); // 5 days from now
    this.dropEndTime = new Date('2025-08-20T12:00:00Z'); // 30 day drop window
  }

  // FIRST RARE DROP CATALOG

  getFirstRareDropCatalog() {
    return {
      dropInfo: {
        id: this.dropId,
        name: this.dropName,
        description: this.dropDescription,
        startTime: this.dropStartTime,
        endTime: this.dropEndTime,
        theme: 'og_legends',
        totalItems: 7,
        totalQuantity: 750,
        isLive: this.isDropLive()
      },
      
      items: [
        // LEGENDARY SHOES
        {
          id: 'muska_highs_og',
          name: 'Muska Highs',
          description: 'Inspired by Chad Muska\'s legendary high-top signature shoes from the 90s',
          category: 'shoes',
          subcategory: 'high_tops',
          rarity: 'legendary',
          totalProduction: 100,
          remainingStock: 100,
          price: 8000, // Hubba Bucks
          
          // Visual Design
          design: {
            silhouette: 'high_top_classic',
            colorway: 'White/Navy/Gum',
            era: '90s',
            inspiration: 'Chad Muska signature style',
            details: [
              'Premium white leather upper',
              'Navy blue accents and heel panel', 
              'Gum rubber outsole',
              'Padded collar and tongue',
              'Vintage-inspired branding'
            ]
          },
          
          // 3D Model Assets
          model: {
            meshPath: '/assets/collectibles/shoes/muska_highs.obj',
            texturePath: '/assets/collectibles/shoes/muska_highs_diffuse.png',
            normalMap: '/assets/collectibles/shoes/muska_highs_normal.png',
            roughnessMap: '/assets/collectibles/shoes/muska_highs_roughness.png',
            metallicMap: '/assets/collectibles/shoes/muska_highs_metallic.png',
            polygonCount: 12500
          },
          
          // Visual Effects (Legendary Tier)
          effects: {
            shader: 'premium_pbr',
            lighting: 'dynamic_ibl',
            materialType: 'leather_premium',
            specialEffects: ['subtle_glow', 'leather_specular', 'vintage_patina'],
            animations: ['legendary_idle_glow'],
            rarityAura: 'golden_shimmer'
          },
          
          // Drop Mechanics
          dropType: 'timed_release',
          releaseTime: this.dropStartTime,
          purchaseLimit: 1, // One per user
          preOrderAvailable: false,
          
          // Marketing
          hypeLevel: 95,
          socialTags: ['muska', 'highs', '90s', 'legend', 'grail'],
          flavorText: '🔥 The shoes that defined a generation. Chad Muska\'s iconic highs are back!',
          
          // Serial Number Premiums
          specialSerials: {
            1: { premium: 0.5, description: 'The Original #1' },
            23: { premium: 0.3, description: 'Muska\'s Favorite Number' },
            69: { premium: 0.2, description: 'Classic Meme Number' },
            100: { premium: 0.3, description: 'Final Edition' }
          }
        },

        {
          id: 'koston_lows_og',
          name: 'Koston Lows',
          description: 'Eric Koston\'s original signature low-top - the shoe that changed everything',
          category: 'shoes',
          subcategory: 'low_tops',
          rarity: 'legendary',
          totalProduction: 100,
          remainingStock: 100,
          price: 7500,
          
          design: {
            silhouette: 'low_top_vulc',
            colorway: 'Black/White/Red',
            era: 'early_2000s',
            inspiration: 'Eric Koston ES Accel',
            details: [
              'Black suede and leather upper',
              'White vulcanized sole',
              'Red accent stitching',
              'Minimal padding for board feel',
              'Clean technical styling'
            ]
          },
          
          model: {
            meshPath: '/assets/collectibles/shoes/koston_lows.obj',
            texturePath: '/assets/collectibles/shoes/koston_lows_diffuse.png',
            normalMap: '/assets/collectibles/shoes/koston_lows_normal.png',
            roughnessMap: '/assets/collectibles/shoes/koston_lows_roughness.png',
            metallicMap: '/assets/collectibles/shoes/koston_lows_metallic.png',
            polygonCount: 11000
          },
          
          effects: {
            shader: 'premium_pbr',
            lighting: 'dynamic_ibl',
            materialType: 'suede_leather_combo',
            specialEffects: ['clean_reflection', 'suede_texture_depth'],
            animations: ['legendary_rotation'],
            rarityAura: 'golden_shimmer'
          },
          
          dropType: 'timed_release',
          releaseTime: this.dropStartTime,
          purchaseLimit: 1,
          
          hypeLevel: 92,
          socialTags: ['koston', 'es', 'tech', 'precision', 'classic'],
          flavorText: '⚡ Technical perfection. The shoe that bridged street and tech.',
          
          specialSerials: {
            1: { premium: 0.5, description: 'Koston\'s Choice #1' },
            42: { premium: 0.2, description: 'The Answer' },
            100: { premium: 0.3, description: 'Century Mark' }
          }
        },

        // EPIC SHOES
        {
          id: 'osiris_d3_yellow_black',
          name: 'Osiris D3',
          description: 'The chunky icon that defined early 2000s skate fashion',
          category: 'shoes',
          subcategory: 'chunky_skate',
          rarity: 'ultra_rare',
          totalProduction: 100,
          remainingStock: 100,
          price: 3500,
          
          design: {
            silhouette: 'chunky_cupsole',
            colorway: 'Yellow/Black/White',
            era: 'early_2000s',
            inspiration: 'Osiris D3 classic',
            details: [
              'Massive chunky silhouette',
              'Yellow mesh and leather panels',
              'Black overlays and accents',
              'Thick white midsole',
              'Oversized tongue and collar'
            ]
          },
          
          model: {
            meshPath: '/assets/collectibles/shoes/osiris_d3.obj',
            texturePath: '/assets/collectibles/shoes/osiris_d3_yellow_diffuse.png',
            normalMap: '/assets/collectibles/shoes/osiris_d3_normal.png',
            roughnessMap: '/assets/collectibles/shoes/osiris_d3_roughness.png',
            metallicMap: '/assets/collectibles/shoes/osiris_d3_metallic.png',
            polygonCount: 15000 // More complex chunky shape
          },
          
          effects: {
            shader: 'stylized_pbr',
            lighting: 'cartoon_enhanced',
            materialType: 'chunky_skate_shoe',
            specialEffects: ['retro_glow', 'y2k_shimmer'],
            animations: ['chunky_bounce'],
            rarityAura: 'purple_energy'
          },
          
          dropType: 'timed_release',
          releaseTime: this.dropStartTime,
          purchaseLimit: 1,
          
          hypeLevel: 88,
          socialTags: ['osiris', 'd3', 'chunky', 'y2k', 'nostalgia'],
          flavorText: '🟡 Maximum chunk energy! The shoe that broke ankles and fashion rules.',
          
          specialSerials: {
            1: { premium: 0.4, description: 'First Chunk' },
            50: { premium: 0.2, description: 'Half Century' },
            100: { premium: 0.3, description: 'Final Chunk' }
          }
        },

        // LEGENDARY SHIRT
        {
          id: 'shortys_og_tee',
          name: 'Shorty\'s OG Tee',
          description: 'The iconic Shorty\'s logo tee that every skater wanted',
          category: 'tops',
          subcategory: 't_shirt',
          rarity: 'legendary',
          totalProduction: 50,
          remainingStock: 50,
          price: 5000,
          
          design: {
            style: 'boxy_oversized',
            colorway: 'Black/White',
            era: 'late_90s',
            inspiration: 'Shorty\'s skateboards team tee',
            details: [
              'Large "SHORTY\'S" text across chest',
              'Stylized "S" logo on sleeves', 
              'Heavyweight cotton construction',
              'Oversized boxy fit',
              'Vintage screen print texture'
            ]
          },
          
          model: {
            meshPath: '/assets/collectibles/tops/shortys_tee.obj',
            texturePath: '/assets/collectibles/tops/shortys_tee_diffuse.png',
            normalMap: '/assets/collectibles/tops/shortys_tee_normal.png',
            roughnessMap: '/assets/collectibles/tops/shortys_tee_roughness.png',
            polygonCount: 8500
          },
          
          effects: {
            shader: 'fabric_premium',
            lighting: 'soft_cloth',
            materialType: 'heavyweight_cotton',
            specialEffects: ['vintage_print_texture', 'fabric_flow'],
            animations: ['legendary_cloth_sway'],
            rarityAura: 'golden_shimmer'
          },
          
          dropType: 'limited_quantity',
          releaseTime: this.dropStartTime,
          purchaseLimit: 1,
          
          hypeLevel: 94,
          socialTags: ['shortys', 'team', 'og', 'iconic', 'rare'],
          flavorText: '🖤 Pure skateboarding heritage. The tee that represented a movement.',
          
          specialSerials: {
            1: { premium: 0.6, description: 'Team Captain #1' },
            13: { premium: 0.3, description: 'Unlucky Lucky' },
            50: { premium: 0.4, description: 'Final Print' }
          }
        },

        // EPIC DECKS
        {
          id: 'muska_board_og',
          name: 'Muska Board',
          description: 'Chad Muska\'s signature deck with transparent grip tape',
          category: 'skateboard',
          subcategory: 'deck',
          rarity: 'ultra_rare',
          totalProduction: 100,
          remainingStock: 100,
          price: 4000,
          
          design: {
            shape: 'classic_popsicle',
            size: '8.25" x 32"',
            colorway: 'Natural/Clear',
            era: 'late_90s',
            inspiration: 'Chad Muska pro model',
            details: [
              'Natural wood finish',
              'Bold graphic design',
              'Transparent grip tape overlay',
              'Classic popsicle shape',
              'Premium 7-ply construction'
            ]
          },
          
          model: {
            meshPath: '/assets/collectibles/decks/muska_board.obj',
            texturePath: '/assets/collectibles/decks/muska_board_diffuse.png',
            normalMap: '/assets/collectibles/decks/muska_board_normal.png',
            roughnessMap: '/assets/collectibles/decks/muska_board_roughness.png',
            polygonCount: 6000
          },
          
          effects: {
            shader: 'wood_premium',
            lighting: 'natural_wood',
            materialType: 'maple_wood',
            specialEffects: ['wood_grain_detail', 'clear_grip_reflection'],
            animations: ['deck_gentle_float'],
            rarityAura: 'purple_energy'
          },
          
          dropType: 'timed_release',
          releaseTime: this.dropStartTime,
          purchaseLimit: 1,
          
          hypeLevel: 89,
          socialTags: ['muska', 'deck', 'transparent', 'grip', 'og'],
          flavorText: '🛹 See-through innovation. The deck that changed how we see skating.',
          
          specialSerials: {
            1: { premium: 0.5, description: 'First Ride' },
            77: { premium: 0.2, description: 'Lucky Sevens' },
            100: { premium: 0.3, description: 'Century Deck' }
          }
        },

        {
          id: 'baker_og_board',
          name: 'Baker OG Board',
          description: 'The board that built Baker Skateboards\' legendary reputation',
          category: 'skateboard',
          subcategory: 'deck',
          rarity: 'ultra_rare',
          totalProduction: 100,
          remainingStock: 100,
          price: 4200,
          
          design: {
            shape: 'classic_popsicle',
            size: '8.0" x 31.5"',
            colorway: 'Red/Black/White',
            era: 'early_2000s',
            inspiration: 'Baker Skateboards team deck',
            details: [
              'Bold red "BKR" logo',
              'Classic Baker colorway',
              'Street-tested shape',
              'Premium maple construction',
              'Iconic team graphics'
            ]
          },
          
          model: {
            meshPath: '/assets/collectibles/decks/baker_board.obj',
            texturePath: '/assets/collectibles/decks/baker_board_diffuse.png',
            normalMap: '/assets/collectibles/decks/baker_board_normal.png',
            roughnessMap: '/assets/collectibles/decks/baker_board_roughness.png',
            polygonCount: 6500
          },
          
          effects: {
            shader: 'wood_premium',
            lighting: 'street_tested',
            materialType: 'street_maple',
            specialEffects: ['baker_logo_glow', 'street_wear_patina'],
            animations: ['baker_spin'],
            rarityAura: 'purple_energy'
          },
          
          dropType: 'timed_release',
          releaseTime: this.dropStartTime,
          purchaseLimit: 1,
          
          hypeLevel: 91,
          socialTags: ['baker', 'street', 'gnarly', 'og', 'team'],
          flavorText: '🔴 Built for the streets. The deck that defined raw skateboarding.',
          
          specialSerials: {
            1: { premium: 0.5, description: 'Baker\'s Dozen Leader' },
            13: { premium: 0.3, description: 'Baker\'s Lucky' },
            100: { premium: 0.3, description: 'Final Baker' }
          }
        },

        // RARE HAT
        {
          id: 'thrasher_trucker_hat',
          name: 'Thrasher Trucker Hat',
          description: 'The iconic mesh trucker hat that every skater recognizes',
          category: 'headwear',
          subcategory: 'trucker_cap',
          rarity: 'rare',
          totalProduction: 300,
          remainingStock: 300,
          price: 1200,
          
          design: {
            style: 'trucker_mesh',
            colorway: 'Black/Yellow',
            era: 'timeless',
            inspiration: 'Classic skate magazine merch',
            details: [
              'Black cotton front panel',
              'Yellow mesh back panels',
              'Embroidered "THRASH" logo',
              'Adjustable snapback closure',
              'High crown classic fit'
            ]
          },
          
          model: {
            meshPath: '/assets/collectibles/headwear/thrasher_trucker.obj',
            texturePath: '/assets/collectibles/headwear/thrasher_trucker_diffuse.png',
            normalMap: '/assets/collectibles/headwear/thrasher_trucker_normal.png',
            roughnessMap: '/assets/collectibles/headwear/thrasher_trucker_roughness.png',
            polygonCount: 4500
          },
          
          effects: {
            shader: 'fabric_mesh_combo',
            lighting: 'natural_fabric',
            materialType: 'cotton_mesh',
            specialEffects: ['mesh_transparency', 'embroidery_depth'],
            animations: ['hat_gentle_sway'],
            rarityAura: 'blue_glow'
          },
          
          dropType: 'high_volume',
          releaseTime: this.dropStartTime,
          purchaseLimit: 2, // Higher limit due to quantity
          
          hypeLevel: 78,
          socialTags: ['thrasher', 'trucker', 'mesh', 'classic', 'skate'],
          flavorText: '🧢 Skate media icon. The hat that represents the culture.',
          
          specialSerials: {
            1: { premium: 0.3, description: 'First Print' },
            100: { premium: 0.2, description: 'Century Mark' },
            200: { premium: 0.15, description: 'Double Century' },
            300: { premium: 0.25, description: 'Final Edition' }
          }
        }
      ]
    };
  }

  // DROP MANAGEMENT

  async initializeFirstRareDrop() {
    try {
      const catalog = this.getFirstRareDropCatalog();
      const batch = [];

      // Create drop event record
      const dropEvent = {
        id: this.dropId,
        name: this.dropName,
        description: this.dropDescription,
        startTime: this.dropStartTime,
        endTime: this.dropEndTime,
        status: this.isDropLive() ? 'live' : 'announced',
        totalItems: catalog.items.length,
        totalQuantity: catalog.items.reduce((sum, item) => sum + item.totalProduction, 0),
        theme: 'og_legends',
        createdAt: serverTimestamp()
      };

      const dropRef = await addDoc(collection(db, 'specialDrops'), dropEvent);

      // Add each item to collectableItems collection
      for (const item of catalog.items) {
        const collectibleItem = {
          ...item,
          dropId: this.dropId,
          dropReference: dropRef.id,
          status: this.isDropLive() ? 'live' : 'announced',
          createdAt: serverTimestamp(),
          
          // Generate serial number tracking
          serialNumbers: this.generateSerialNumbers(item.totalProduction, item.specialSerials),
          
          // Add marketplace metadata
          viewCount: 0,
          purchaseCount: 0,
          wishlistCount: 0,
          lastSoldAt: null,
          lastSoldPrice: null,
          
          // FOMO mechanics
          urgencyLevel: this.calculateInitialUrgency(item),
          marketingBoosts: this.getMarketingBoosts(item)
        };

        await addDoc(collection(db, 'collectableItems'), collectibleItem);
      }

      analyticsService.logEvent('rare_drop_initialized', {
        category: EventCategory.COLLECTIBLES,
        drop_id: this.dropId,
        total_items: catalog.items.length,
        total_quantity: dropEvent.totalQuantity
      });

      return { success: true, dropId: this.dropId, itemsCreated: catalog.items.length };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'first_rare_drop',
        action: 'initialize_drop'
      });
      throw error;
    }
  }

  // DROP UI COMPONENTS

  getDropMarketplaceUI() {
    const catalog = this.getFirstRareDropCatalog();
    
    return {
      hero: {
        title: '🔥 OG Legends Collection',
        subtitle: 'The most iconic pieces from skateboarding\'s golden era',
        countdown: this.getDropCountdown(),
        backgroundImage: '/assets/drops/og_legends_hero.jpg',
        animation: 'legendary_particles',
        status: this.isDropLive() ? 'LIVE NOW' : 'COMING SOON'
      },
      
      categories: [
        {
          name: 'Legendary Shoes',
          description: 'Icon status footwear',
          items: catalog.items.filter(item => item.rarity === 'legendary' && item.category === 'shoes'),
          displayStyle: 'premium_cards',
          rarityGlow: 'golden'
        },
        {
          name: 'Ultra Rare Gear',
          description: 'Sought-after skateboarding essentials',
          items: catalog.items.filter(item => item.rarity === 'ultra_rare'),
          displayStyle: 'enhanced_cards',
          rarityGlow: 'purple'
        },
        {
          name: 'Rare Accessories',
          description: 'Complete your legendary look',
          items: catalog.items.filter(item => item.rarity === 'rare'),
          displayStyle: 'standard_cards',
          rarityGlow: 'blue'
        }
      ],
      
      featuredItem: this.getFeaturedItem(catalog.items),
      
      stats: {
        totalItems: catalog.items.length,
        totalQuantity: catalog.items.reduce((sum, item) => sum + item.totalProduction, 0),
        averagePrice: Math.round(catalog.items.reduce((sum, item) => sum + item.price, 0) / catalog.items.length),
        mostExpensive: Math.max(...catalog.items.map(item => item.price)),
        timeRemaining: this.getDropCountdown()
      }
    };
  }

  getItemPurchaseUI(itemId) {
    const catalog = this.getFirstRareDropCatalog();
    const item = catalog.items.find(i => i.id === itemId);
    
    if (!item) return null;
    
    return {
      item: {
        ...item,
        stockAlert: this.generateStockAlert(item),
        urgencyMessage: this.generateUrgencyMessage(item),
        rarityBadge: this.getRarityBadge(item.rarity),
        priceDisplay: this.formatPrice(item.price)
      },
      
      availableSerials: this.getAvailableSerials(item),
      
      avatarPreview: {
        showOn3D: true,
        backgrounds: ['studio', 'skate_park', 'street'],
        animations: ['idle', 'showcase_pose'],
        lighting: 'premium'
      },
      
      purchaseFlow: {
        steps: ['select_serial', 'confirm_price', 'process_payment', 'complete'],
        estimatedTime: '30 seconds',
        confirmationRequired: true
      },
      
      socialProof: {
        recentPurchases: this.getRecentPurchases(itemId),
        itemPopularity: item.hypeLevel,
        wishlistCount: item.wishlistCount || 0
      },
      
      warnings: [
        'Limited quantity - once sold out, gone forever!',
        'Serial numbers assigned randomly',
        'All sales are final - no refunds',
        'Items become tradeable immediately after purchase'
      ]
    };
  }

  // UTILITY FUNCTIONS

  isDropLive() {
    const now = new Date();
    return now >= this.dropStartTime && now <= this.dropEndTime;
  }

  getDropCountdown() {
    const now = new Date();
    const targetTime = this.isDropLive() ? this.dropEndTime : this.dropStartTime;
    const diff = targetTime.getTime() - now.getTime();
    
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
      isLive: this.isDropLive(),
      displayText: this.isDropLive() ? 
        `Drop ends in ${days}d ${hours}h ${minutes}m` :
        `Drop starts in ${days}d ${hours}h ${minutes}m`
    };
  }

  generateSerialNumbers(totalProduction, specialSerials = {}) {
    const serials = [];
    
    for (let i = 1; i <= totalProduction; i++) {
      serials.push({
        number: i,
        isAvailable: true,
        isSpecial: !!specialSerials[i],
        premium: specialSerials[i]?.premium || 0,
        description: specialSerials[i]?.description || null,
        ownerId: null,
        soldAt: null
      });
    }
    
    return serials;
  }

  calculateInitialUrgency(item) {
    if (item.rarity === 'legendary') return 'high';
    if (item.totalProduction <= 50) return 'high';
    if (item.totalProduction <= 100) return 'medium';
    return 'low';
  }

  getMarketingBoosts(item) {
    const boosts = [];
    
    if (item.rarity === 'legendary') boosts.push('legendary_glow');
    if (item.totalProduction <= 50) boosts.push('limited_edition');
    if (item.specialSerials && Object.keys(item.specialSerials).length > 0) {
      boosts.push('special_serials');
    }
    
    return boosts;
  }

  getFeaturedItem(items) {
    // Feature the Muska Highs as the hero item
    const muska = items.find(item => item.id === 'muska_highs_og');
    
    return {
      ...muska,
      featuredReason: 'Most Hyped',
      spotlight: true,
      heroAnimation: 'legendary_showcase'
    };
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
    if (item.rarity === 'legendary') return '👑 LEGENDARY STATUS! These will sell out fast!';
    if (item.totalProduction <= 50) return '⚡ ULTRA LIMITED! Don\'t miss out!';
    if (item.totalProduction <= 100) return '🔥 LIMITED QUANTITY! Act quickly!';
    return '✨ Limited time availability!';
  }

  getRarityBadge(rarity) {
    const badges = {
      rare: { color: '#007AFF', label: 'RARE', glow: 'blue' },
      ultra_rare: { color: '#5856D6', label: 'ULTRA RARE', glow: 'purple' },
      legendary: { color: '#FF9500', label: 'LEGENDARY', glow: 'golden' }
    };
    return badges[rarity];
  }

  formatPrice(price) {
    if (price >= 1000) {
      return `${(price / 1000).toFixed(1)}K HB`;
    }
    return `${price.toLocaleString()} HB`;
  }

  getAvailableSerials(item) {
    return item.serialNumbers
      .filter(serial => serial.isAvailable)
      .map(serial => ({
        number: serial.number,
        isSpecial: serial.isSpecial,
        premium: serial.premium,
        description: serial.description,
        priceAdjustment: serial.premium ? Math.round(item.price * serial.premium) : 0
      }))
      .slice(0, 10); // Show first 10 available
  }

  getRecentPurchases(itemId) {
    // Simulated recent purchase data
    return [
      { timeAgo: '2m ago', serialNumber: 23, anonymous: true },
      { timeAgo: '15m ago', serialNumber: 7, anonymous: true },
      { timeAgo: '1h ago', serialNumber: 45, anonymous: true }
    ];
  }

  // PURCHASE PROCESSING

  async purchaseFirstDropItem(userId, itemId, selectedSerial = null) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Use the existing digital gear service to handle the purchase
        const result = await DigitalGearService.purchaseCollectableItem(
          userId, 
          itemId, 
          selectedSerial
        );
        
        // Add first drop specific tracking
        analyticsService.logEvent('first_drop_purchase', {
          category: EventCategory.COLLECTIBLES,
          user_id: userId,
          item_id: itemId,
          serial_number: selectedSerial,
          drop_id: this.dropId
        });
        
        return result;
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'first_rare_drop',
        action: 'purchase_item'
      });
      throw error;
    }
  }

  // DROP ANALYTICS

  async getDropAnalytics() {
    try {
      const analytics = {
        overview: {
          totalViews: 0,
          totalPurchases: 0,
          totalRevenue: 0,
          conversionRate: 0
        },
        itemPerformance: {},
        userEngagement: {
          uniqueVisitors: 0,
          averageTimeOnDrop: 0,
          wishlistAdds: 0
        },
        salesVelocity: {
          salesPerHour: 0,
          fastestSelling: null,
          slowestSelling: null
        }
      };
      
      // Would normally query actual data
      return analytics;
    } catch (error) {
      return {};
    }
  }
}

export default new FirstRareDropService();
