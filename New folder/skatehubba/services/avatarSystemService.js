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
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';

class AvatarSystemService {
  constructor() {
    this.standardGearCache = new Map();
    this.avatarPresets = new Map();
  }

  // STANDARD AVATAR GEAR (FREE)

  getStandardGearCatalog() {
    return {
      shoes: [
        // Low-top "Vulc Classic" (Vans-style)
        {
          id: 'vulc_classic_black',
          name: 'Vulc Classic',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Classic low-top vulcanized shoe with signature V-line',
          model: {
            meshPath: '/assets/avatar/shoes/vulc_classic.obj',
            texturePath: '/assets/avatar/shoes/vulc_classic_black.png',
            normalMap: '/assets/avatar/shoes/vulc_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#2d2d2d', accent: '#8b4513' }, // Black with gum sole
          tags: ['classic', 'vulc', 'everyday']
        },
        {
          id: 'vulc_classic_white',
          name: 'Vulc Classic',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'White',
          description: 'Clean white vulcanized classic',
          model: {
            meshPath: '/assets/avatar/shoes/vulc_classic.obj',
            texturePath: '/assets/avatar/shoes/vulc_classic_white.png',
            normalMap: '/assets/avatar/shoes/vulc_basic_normal.png'
          },
          colors: { primary: '#ffffff', secondary: '#f5f5f5', accent: '#8b4513' },
          tags: ['classic', 'vulc', 'clean']
        },
        // Cupsole "Tech Runner" (DC/éS style)
        {
          id: 'tech_runner_black_red',
          name: 'Tech Runner',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'Black/Red',
          description: 'Early 2000s inspired cupsole with tech styling',
          model: {
            meshPath: '/assets/avatar/shoes/tech_runner.obj',
            texturePath: '/assets/avatar/shoes/tech_runner_black_red.png',
            normalMap: '/assets/avatar/shoes/tech_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#cc0000', accent: '#ffffff' },
          tags: ['cupsole', 'tech', '2000s']
        },
        {
          id: 'tech_runner_navy',
          name: 'Tech Runner',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'Navy',
          description: 'Navy colorway of the classic tech runner',
          model: {
            meshPath: '/assets/avatar/shoes/tech_runner.obj',
            texturePath: '/assets/avatar/shoes/tech_runner_navy.png',
            normalMap: '/assets/avatar/shoes/tech_basic_normal.png'
          },
          colors: { primary: '#1e3a8a', secondary: '#3b82f6', accent: '#ffffff' },
          tags: ['cupsole', 'tech', 'navy']
        },
        {
          id: 'tech_runner_grey',
          name: 'Tech Runner',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'Grey',
          description: 'Understated grey tech runner',
          model: {
            meshPath: '/assets/avatar/shoes/tech_runner.obj',
            texturePath: '/assets/avatar/shoes/tech_runner_grey.png',
            normalMap: '/assets/avatar/shoes/tech_basic_normal.png'
          },
          colors: { primary: '#6b7280', secondary: '#9ca3af', accent: '#ffffff' },
          tags: ['cupsole', 'tech', 'neutral']
        },
        // Slip-on "Park Cruiser"
        {
          id: 'park_cruiser_checkerboard',
          name: 'Park Cruiser',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'Checkerboard',
          description: 'Classic slip-on with iconic checkerboard pattern',
          model: {
            meshPath: '/assets/avatar/shoes/park_cruiser.obj',
            texturePath: '/assets/avatar/shoes/park_cruiser_checker.png',
            normalMap: '/assets/avatar/shoes/slip_basic_normal.png'
          },
          colors: { primary: '#000000', secondary: '#ffffff', accent: '#8b4513' },
          tags: ['slip-on', 'classic', 'checkerboard']
        },
        {
          id: 'park_cruiser_black',
          name: 'Park Cruiser',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'All-Black',
          description: 'Stealth black slip-on for any session',
          model: {
            meshPath: '/assets/avatar/shoes/park_cruiser.obj',
            texturePath: '/assets/avatar/shoes/park_cruiser_black.png',
            normalMap: '/assets/avatar/shoes/slip_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#000000', accent: '#1a1a1a' },
          tags: ['slip-on', 'stealth', 'minimalist']
        },
        {
          id: 'park_cruiser_blue_white',
          name: 'Park Cruiser',
          category: 'shoes',
          rarity: 'standard',
          colorway: 'Blue/White',
          description: 'Classic blue and white slip-on combination',
          model: {
            meshPath: '/assets/avatar/shoes/park_cruiser.obj',
            texturePath: '/assets/avatar/shoes/park_cruiser_blue_white.png',
            normalMap: '/assets/avatar/shoes/slip_basic_normal.png'
          },
          colors: { primary: '#2563eb', secondary: '#ffffff', accent: '#8b4513' },
          tags: ['slip-on', 'classic', 'two-tone']
        }
      ],

      pants: [
        {
          id: 'loose_jeans_light_blue',
          name: 'Loose Jeans',
          category: 'pants',
          rarity: 'standard',
          colorway: 'Light Blue',
          description: 'Classic loose-fit denim for comfortable skating',
          model: {
            meshPath: '/assets/avatar/pants/loose_jeans.obj',
            texturePath: '/assets/avatar/pants/loose_jeans_light.png',
            normalMap: '/assets/avatar/pants/denim_basic_normal.png'
          },
          colors: { primary: '#7db3d3', secondary: '#5a9bc4', accent: '#2d5f7f' },
          tags: ['denim', 'loose', 'casual']
        },
        {
          id: 'loose_jeans_black',
          name: 'Loose Jeans',
          category: 'pants',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Versatile black denim with relaxed fit',
          model: {
            meshPath: '/assets/avatar/pants/loose_jeans.obj',
            texturePath: '/assets/avatar/pants/loose_jeans_black.png',
            normalMap: '/assets/avatar/pants/denim_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#2d2d2d', accent: '#404040' },
          tags: ['denim', 'loose', 'versatile']
        },
        {
          id: 'cargo_shorts_khaki',
          name: 'Cargo Shorts',
          category: 'pants',
          rarity: 'standard',
          colorway: 'Khaki',
          description: 'Practical cargo shorts with multiple pockets',
          model: {
            meshPath: '/assets/avatar/pants/cargo_shorts.obj',
            texturePath: '/assets/avatar/pants/cargo_shorts_khaki.png',
            normalMap: '/assets/avatar/pants/cargo_basic_normal.png'
          },
          colors: { primary: '#c3b091', secondary: '#a0956b', accent: '#8b7355' },
          tags: ['cargo', 'shorts', 'practical']
        },
        {
          id: 'cargo_shorts_camo',
          name: 'Cargo Shorts',
          category: 'pants',
          rarity: 'standard',
          colorway: 'Camo',
          description: 'Urban camo cargo shorts for street sessions',
          model: {
            meshPath: '/assets/avatar/pants/cargo_shorts.obj',
            texturePath: '/assets/avatar/pants/cargo_shorts_camo.png',
            normalMap: '/assets/avatar/pants/cargo_basic_normal.png'
          },
          colors: { primary: '#4a5d23', secondary: '#3a4a1b', accent: '#2d3614' },
          tags: ['cargo', 'shorts', 'camo']
        },
        {
          id: 'straight_chinos_tan',
          name: 'Straight Chinos',
          category: 'pants',
          rarity: 'standard',
          colorway: 'Tan',
          description: 'Clean straight-leg chinos for any occasion',
          model: {
            meshPath: '/assets/avatar/pants/straight_chinos.obj',
            texturePath: '/assets/avatar/pants/straight_chinos_tan.png',
            normalMap: '/assets/avatar/pants/chino_basic_normal.png'
          },
          colors: { primary: '#d2b48c', secondary: '#c19a6b', accent: '#a0804a' },
          tags: ['chinos', 'straight', 'clean']
        },
        {
          id: 'straight_chinos_olive',
          name: 'Straight Chinos',
          category: 'pants',
          rarity: 'standard',
          colorway: 'Olive',
          description: 'Military-inspired olive chinos',
          model: {
            meshPath: '/assets/avatar/pants/straight_chinos.obj',
            texturePath: '/assets/avatar/pants/straight_chinos_olive.png',
            normalMap: '/assets/avatar/pants/chino_basic_normal.png'
          },
          colors: { primary: '#6b8e23', secondary: '#556b2f', accent: '#3c5015' },
          tags: ['chinos', 'straight', 'olive']
        }
      ],

      tops: [
        {
          id: 'boxy_tee_white',
          name: 'Boxy Tee',
          category: 'tops',
          rarity: 'standard',
          colorway: 'White',
          description: 'Oversized boxy t-shirt for comfort and style',
          model: {
            meshPath: '/assets/avatar/tops/boxy_tee.obj',
            texturePath: '/assets/avatar/tops/boxy_tee_white.png',
            normalMap: '/assets/avatar/tops/tee_basic_normal.png'
          },
          colors: { primary: '#ffffff', secondary: '#f5f5f5', accent: '#e5e5e5' },
          tags: ['t-shirt', 'boxy', 'basic']
        },
        {
          id: 'boxy_tee_black',
          name: 'Boxy Tee',
          category: 'tops',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Classic black boxy tee',
          model: {
            meshPath: '/assets/avatar/tops/boxy_tee.obj',
            texturePath: '/assets/avatar/tops/boxy_tee_black.png',
            normalMap: '/assets/avatar/tops/tee_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#000000', accent: '#2d2d2d' },
          tags: ['t-shirt', 'boxy', 'classic']
        },
        {
          id: 'boxy_tee_red',
          name: 'Boxy Tee',
          category: 'tops',
          rarity: 'standard',
          colorway: 'Red',
          description: 'Bold red boxy tee for standout style',
          model: {
            meshPath: '/assets/avatar/tops/boxy_tee.obj',
            texturePath: '/assets/avatar/tops/boxy_tee_red.png',
            normalMap: '/assets/avatar/tops/tee_basic_normal.png'
          },
          colors: { primary: '#dc2626', secondary: '#b91c1c', accent: '#991b1b' },
          tags: ['t-shirt', 'boxy', 'bold']
        },
        {
          id: 'pullover_hoodie_grey',
          name: 'Pullover Hoodie',
          category: 'tops',
          rarity: 'standard',
          colorway: 'Grey',
          description: 'Cozy pullover hoodie for chilly sessions',
          model: {
            meshPath: '/assets/avatar/tops/pullover_hoodie.obj',
            texturePath: '/assets/avatar/tops/pullover_hoodie_grey.png',
            normalMap: '/assets/avatar/tops/hoodie_basic_normal.png'
          },
          colors: { primary: '#6b7280', secondary: '#4b5563', accent: '#374151' },
          tags: ['hoodie', 'pullover', 'cozy']
        },
        {
          id: 'pullover_hoodie_navy',
          name: 'Pullover Hoodie',
          category: 'tops',
          rarity: 'standard',
          colorway: 'Navy',
          description: 'Classic navy pullover hoodie',
          model: {
            meshPath: '/assets/avatar/tops/pullover_hoodie.obj',
            texturePath: '/assets/avatar/tops/pullover_hoodie_navy.png',
            normalMap: '/assets/avatar/tops/hoodie_basic_normal.png'
          },
          colors: { primary: '#1e3a8a', secondary: '#1e40af', accent: '#1d4ed8' },
          tags: ['hoodie', 'pullover', 'navy']
        },
        {
          id: 'pullover_hoodie_forest',
          name: 'Pullover Hoodie',
          category: 'tops',
          rarity: 'standard',
          colorway: 'Forest Green',
          description: 'Earth-tone forest green hoodie',
          model: {
            meshPath: '/assets/avatar/tops/pullover_hoodie.obj',
            texturePath: '/assets/avatar/tops/pullover_hoodie_forest.png',
            normalMap: '/assets/avatar/tops/hoodie_basic_normal.png'
          },
          colors: { primary: '#166534', secondary: '#15803d', accent: '#16a34a' },
          tags: ['hoodie', 'pullover', 'green']
        }
      ],

      headwear: [
        {
          id: 'beanie_black',
          name: 'Beanie',
          category: 'headwear',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Classic knit beanie for cold weather skating',
          model: {
            meshPath: '/assets/avatar/headwear/beanie.obj',
            texturePath: '/assets/avatar/headwear/beanie_black.png',
            normalMap: '/assets/avatar/headwear/knit_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#000000', accent: '#2d2d2d' },
          tags: ['beanie', 'knit', 'winter']
        },
        {
          id: 'beanie_grey',
          name: 'Beanie',
          category: 'headwear',
          rarity: 'standard',
          colorway: 'Grey',
          description: 'Versatile grey knit beanie',
          model: {
            meshPath: '/assets/avatar/headwear/beanie.obj',
            texturePath: '/assets/avatar/headwear/beanie_grey.png',
            normalMap: '/assets/avatar/headwear/knit_basic_normal.png'
          },
          colors: { primary: '#6b7280', secondary: '#4b5563', accent: '#374151' },
          tags: ['beanie', 'knit', 'neutral']
        },
        {
          id: 'beanie_olive',
          name: 'Beanie',
          category: 'headwear',
          rarity: 'standard',
          colorway: 'Olive',
          description: 'Military-inspired olive beanie',
          model: {
            meshPath: '/assets/avatar/headwear/beanie.obj',
            texturePath: '/assets/avatar/headwear/beanie_olive.png',
            normalMap: '/assets/avatar/headwear/knit_basic_normal.png'
          },
          colors: { primary: '#6b8e23', secondary: '#556b2f', accent: '#3c5015' },
          tags: ['beanie', 'knit', 'olive']
        },
        {
          id: 'baseball_cap_black',
          name: 'Baseball Cap',
          category: 'headwear',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Classic six-panel baseball cap',
          model: {
            meshPath: '/assets/avatar/headwear/baseball_cap.obj',
            texturePath: '/assets/avatar/headwear/baseball_cap_black.png',
            normalMap: '/assets/avatar/headwear/cap_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#000000', accent: '#2d2d2d' },
          tags: ['cap', 'baseball', 'classic']
        },
        {
          id: 'baseball_cap_navy',
          name: 'Baseball Cap',
          category: 'headwear',
          rarity: 'standard',
          colorway: 'Navy',
          description: 'Navy blue baseball cap',
          model: {
            meshPath: '/assets/avatar/headwear/baseball_cap.obj',
            texturePath: '/assets/avatar/headwear/baseball_cap_navy.png',
            normalMap: '/assets/avatar/headwear/cap_basic_normal.png'
          },
          colors: { primary: '#1e3a8a', secondary: '#1e40af', accent: '#1d4ed8' },
          tags: ['cap', 'baseball', 'navy']
        },
        {
          id: 'baseball_cap_red',
          name: 'Baseball Cap',
          category: 'headwear',
          rarity: 'standard',
          colorway: 'Red',
          description: 'Bold red baseball cap',
          model: {
            meshPath: '/assets/avatar/headwear/baseball_cap.obj',
            texturePath: '/assets/avatar/headwear/baseball_cap_red.png',
            normalMap: '/assets/avatar/headwear/cap_basic_normal.png'
          },
          colors: { primary: '#dc2626', secondary: '#b91c1c', accent: '#991b1b' },
          tags: ['cap', 'baseball', 'red']
        }
      ],

      hair: [
        {
          id: 'short_hair_black',
          name: 'Short Hair',
          category: 'hair',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Classic short hairstyle',
          model: {
            meshPath: '/assets/avatar/hair/short_hair.obj',
            texturePath: '/assets/avatar/hair/short_hair_black.png',
            normalMap: '/assets/avatar/hair/hair_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#000000', accent: '#2d2d2d' },
          tags: ['hair', 'short', 'classic']
        },
        {
          id: 'short_hair_brown',
          name: 'Short Hair',
          category: 'hair',
          rarity: 'standard',
          colorway: 'Brown',
          description: 'Natural brown short hair',
          model: {
            meshPath: '/assets/avatar/hair/short_hair.obj',
            texturePath: '/assets/avatar/hair/short_hair_brown.png',
            normalMap: '/assets/avatar/hair/hair_basic_normal.png'
          },
          colors: { primary: '#8b4513', secondary: '#a0522d', accent: '#d2691e' },
          tags: ['hair', 'short', 'brown']
        },
        {
          id: 'short_hair_blonde',
          name: 'Short Hair',
          category: 'hair',
          rarity: 'standard',
          colorway: 'Blonde',
          description: 'Light blonde short hair',
          model: {
            meshPath: '/assets/avatar/hair/short_hair.obj',
            texturePath: '/assets/avatar/hair/short_hair_blonde.png',
            normalMap: '/assets/avatar/hair/hair_basic_normal.png'
          },
          colors: { primary: '#f4d03f', secondary: '#f7dc6f', accent: '#fcf3cf' },
          tags: ['hair', 'short', 'blonde']
        },
        {
          id: 'long_hair_brown',
          name: 'Long Hair',
          category: 'hair',
          rarity: 'standard',
          colorway: 'Brown',
          description: 'Long flowing brown hair',
          model: {
            meshPath: '/assets/avatar/hair/long_hair.obj',
            texturePath: '/assets/avatar/hair/long_hair_brown.png',
            normalMap: '/assets/avatar/hair/hair_basic_normal.png'
          },
          colors: { primary: '#8b4513', secondary: '#a0522d', accent: '#d2691e' },
          tags: ['hair', 'long', 'brown']
        },
        {
          id: 'long_hair_blonde',
          name: 'Long Hair',
          category: 'hair',
          rarity: 'standard',
          colorway: 'Blonde',
          description: 'Long blonde hair',
          model: {
            meshPath: '/assets/avatar/hair/long_hair.obj',
            texturePath: '/assets/avatar/hair/long_hair_blonde.png',
            normalMap: '/assets/avatar/hair/hair_basic_normal.png'
          },
          colors: { primary: '#f4d03f', secondary: '#f7dc6f', accent: '#fcf3cf' },
          tags: ['hair', 'long', 'blonde']
        },
        {
          id: 'long_hair_black',
          name: 'Long Hair',
          category: 'hair',
          rarity: 'standard',
          colorway: 'Black',
          description: 'Long black hair',
          model: {
            meshPath: '/assets/avatar/hair/long_hair.obj',
            texturePath: '/assets/avatar/hair/long_hair_black.png',
            normalMap: '/assets/avatar/hair/hair_basic_normal.png'
          },
          colors: { primary: '#1a1a1a', secondary: '#000000', accent: '#2d2d2d' },
          tags: ['hair', 'long', 'black']
        }
      ]
    };
  }

  // SKIN TONE OPTIONS

  getSkinToneOptions() {
    return [
      {
        id: 'light',
        name: 'Light',
        description: 'Light skin tone',
        hexColor: '#f5deb3',
        rgbColor: { r: 245, g: 222, b: 179 },
        textureMultiplier: { r: 1.0, g: 0.9, b: 0.7 }
      },
      {
        id: 'medium',
        name: 'Medium',
        description: 'Medium skin tone',
        hexColor: '#deb887',
        rgbColor: { r: 222, g: 184, b: 135 },
        textureMultiplier: { r: 0.9, g: 0.75, b: 0.55 }
      },
      {
        id: 'dark',
        name: 'Dark',
        description: 'Dark skin tone',
        hexColor: '#8b4513',
        rgbColor: { r: 139, g: 69, b: 19 },
        textureMultiplier: { r: 0.55, g: 0.35, b: 0.15 }
      }
    ];
  }

  // AVATAR CREATION & CUSTOMIZATION

  async createUserAvatar(userId, avatarData) {
    try {
      const {
        skinTone,
        selectedGear, // { shoes, pants, tops, headwear, hair }
        avatarName = 'My Avatar'
      } = avatarData;

      // Validate skin tone
      const skinTones = this.getSkinToneOptions();
      const selectedSkinTone = skinTones.find(tone => tone.id === skinTone);
      if (!selectedSkinTone) {
        throw new Error('Invalid skin tone selected');
      }

      // Validate gear selections (all must be standard rarity for new users)
      const standardCatalog = this.getStandardGearCatalog();
      const avatar = {
        userId,
        avatarName,
        skinTone: selectedSkinTone,
        equippedGear: {},
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        version: '1.0'
      };

      // Set default gear if not provided
      Object.keys(standardCatalog).forEach(category => {
        if (selectedGear[category]) {
          const selectedItem = standardCatalog[category].find(item => item.id === selectedGear[category]);
          if (selectedItem) {
            avatar.equippedGear[category] = {
              itemId: selectedItem.id,
              rarity: 'standard',
              source: 'default',
              equippedAt: new Date()
            };
          } else {
            // Use first item as default
            avatar.equippedGear[category] = {
              itemId: standardCatalog[category][0].id,
              rarity: 'standard',
              source: 'default',
              equippedAt: new Date()
            };
          }
        } else {
          // Set default first item for each category
          avatar.equippedGear[category] = {
            itemId: standardCatalog[category][0].id,
            rarity: 'standard',
            source: 'default',
            equippedAt: new Date()
          };
        }
      });

      const docRef = await addDoc(collection(db, 'userAvatars'), avatar);

      analyticsService.logEvent('avatar_created', {
        category: EventCategory.AVATAR,
        user_id: userId,
        skin_tone: skinTone,
        gear_selections: Object.keys(selectedGear).length
      });

      return { 
        success: true, 
        avatarId: docRef.id,
        avatar: { id: docRef.id, ...avatar }
      };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'create_user_avatar'
      });
      throw error;
    }
  }

  // AVATAR EQUIPMENT & INVENTORY INTEGRATION

  async equipItem(userId, itemId, slot) {
    try {
      return await runTransaction(db, async (transaction) => {
        // 1. Verify user owns the item
        const inventoryQuery = query(
          collection(db, 'userInventory', userId, 'items'),
          where('itemId', '==', itemId)
        );
        
        const inventorySnapshot = await getDocs(inventoryQuery);
        if (inventorySnapshot.empty) {
          throw new Error('Item not found in user inventory');
        }

        const item = inventorySnapshot.docs[0].data();
        
        // 2. Validate slot compatibility
        if (!this.isSlotCompatible(item.category, slot)) {
          throw new Error(`Item category ${item.category} cannot be equipped to slot ${slot}`);
        }

        // 3. Get current avatar configuration
        const avatarDoc = await transaction.get(doc(db, 'userAvatars', userId));
        let avatarData = avatarDoc.exists() ? avatarDoc.data() : this.getDefaultAvatarConfig();

        // 4. Unequip current item in slot if any
        if (avatarData.equipped[slot]) {
          avatarData.equipped[slot] = null;
        }

        // 5. Equip new item
        avatarData.equipped[slot] = {
          itemId: item.itemId,
          name: item.itemName,
          category: item.category,
          rarity: item.rarity,
          serialNumber: item.serialNumber,
          equipTimestamp: serverTimestamp()
        };

        avatarData.lastModified = serverTimestamp();

        // 6. Calculate avatar stats
        avatarData.stats = await this.calculateAvatarStats(avatarData.equipped);

        // 7. Save avatar configuration
        transaction.set(doc(db, 'userAvatars', userId), avatarData);

        analyticsService.logEvent('avatar_item_equipped', {
          category: EventCategory.AVATAR,
          user_id: userId,
          item_id: itemId,
          slot: slot,
          rarity: item.rarity
        });

        return {
          success: true,
          equippedItem: avatarData.equipped[slot],
          newStats: avatarData.stats
        };
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'equip_item',
        user_id: userId,
        item_id: itemId
      });
      throw error;
    }
  }

  isSlotCompatible(category, slot) {
    const compatibility = {
      shoes: ['feet'],
      decks: ['deck'],
      wheels: ['wheels'],
      trucks: ['trucks'],
      clothing: ['top', 'bottom', 'outerwear'],
      accessories: ['head', 'hands', 'misc'],
      stickers: ['deck_stickers']
    };

    return compatibility[category]?.includes(slot) || false;
  }

  async calculateAvatarStats(equippedItems) {
    const baseStats = {
      style: 0,
      comfort: 0,
      durability: 0,
      performance: 0,
      rarity_bonus: 0
    };

    Object.values(equippedItems).forEach(item => {
      if (item) {
        // Get item stats from catalog
        const itemStats = this.getItemStats(item.itemId);
        if (itemStats) {
          baseStats.style += itemStats.style || 0;
          baseStats.comfort += itemStats.comfort || 0;
          baseStats.durability += itemStats.durability || 0;
          baseStats.performance += itemStats.performance || 0;
        }

        // Rarity bonuses
        const rarityBonus = this.getRarityBonus(item.rarity);
        baseStats.rarity_bonus += rarityBonus;
      }
    });

    // Apply rarity bonus to all stats
    const totalMultiplier = 1 + (baseStats.rarity_bonus * 0.1);
    baseStats.style = Math.round(baseStats.style * totalMultiplier);
    baseStats.comfort = Math.round(baseStats.comfort * totalMultiplier);
    baseStats.durability = Math.round(baseStats.durability * totalMultiplier);
    baseStats.performance = Math.round(baseStats.performance * totalMultiplier);

    return baseStats;
  }

  getItemStats(itemId) {
    // Look up item stats from standard gear catalog
    const standardGear = this.getStandardGearCatalog();
    
    for (const category of Object.values(standardGear)) {
      const item = category.find(item => item.id === itemId);
      if (item && item.stats) {
        return item.stats;
      }
    }

    // Default stats for unknown items
    return { style: 1, comfort: 1, durability: 1, performance: 1 };
  }

  getRarityBonus(rarity) {
    const bonuses = {
      standard: 0,
      rare: 1,
      ultra_rare: 3,
      legendary: 5,
      mythic: 10
    };
    return bonuses[rarity] || 0;
  }

  getDefaultAvatarConfig() {
    return {
      equipped: {
        feet: null,
        deck: null,
        wheels: null,
        trucks: null,
        top: null,
        bottom: null,
        outerwear: null,
        head: null,
        hands: null,
        misc: null,
        deck_stickers: null
      },
      stats: {
        style: 0,
        comfort: 0,
        durability: 0,
        performance: 0,
        rarity_bonus: 0
      },
      appearance: {
        skin_tone: 'medium',
        hair_style: 'default',
        hair_color: 'brown',
        body_type: 'average'
      },
      poses: {
        idle: 'casual_stance',
        trick: 'kickflip_prep',
        celebration: 'arms_up'
      },
      createdAt: serverTimestamp(),
      lastModified: serverTimestamp()
    };
  }

  // AVATAR CUSTOMIZATION

  async updateAvatarAppearance(userId, appearanceData) {
    try {
      const avatarRef = doc(db, 'userAvatars', userId);
      const avatarDoc = await getDoc(avatarRef);
      
      let avatarData = avatarDoc.exists() ? avatarDoc.data() : this.getDefaultAvatarConfig();
      
      // Update appearance settings
      avatarData.appearance = {
        ...avatarData.appearance,
        ...appearanceData
      };
      
      avatarData.lastModified = serverTimestamp();
      
      await updateDoc(avatarRef, avatarData);

      analyticsService.logEvent('avatar_appearance_updated', {
        category: EventCategory.AVATAR,
        user_id: userId,
        changes: Object.keys(appearanceData)
      });

      return { success: true, appearance: avatarData.appearance };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'update_appearance',
        user_id: userId
      });
      throw error;
    }
  }

  async updateAvatarPoses(userId, poses) {
    try {
      const avatarRef = doc(db, 'userAvatars', userId);
      const avatarDoc = await getDoc(avatarRef);
      
      let avatarData = avatarDoc.exists() ? avatarDoc.data() : this.getDefaultAvatarConfig();
      
      avatarData.poses = {
        ...avatarData.poses,
        ...poses
      };
      
      avatarData.lastModified = serverTimestamp();
      
      await updateDoc(avatarRef, avatarData);

      return { success: true, poses: avatarData.poses };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'update_poses',
        user_id: userId
      });
      throw error;
    }
  }

  // AVATAR DISPLAY & SOCIAL

  async getUserAvatar(userId) {
    try {
      const avatarDoc = await getDoc(doc(db, 'userAvatars', userId));
      
      if (!avatarDoc.exists()) {
        // Create default avatar for new user
        const defaultAvatar = this.getDefaultAvatarConfig();
        await setDoc(doc(db, 'userAvatars', userId), defaultAvatar);
        return defaultAvatar;
      }

      const avatarData = avatarDoc.data();
      
      // Ensure stats are up to date
      avatarData.stats = await this.calculateAvatarStats(avatarData.equipped);
      
      return avatarData;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'get_user_avatar',
        user_id: userId
      });
      throw error;
    }
  }

  async getAvatarShowcase(userId) {
    try {
      const avatarData = await this.getUserAvatar(userId);
      
      // Get detailed item information for equipped items
      const showcase = {
        user_id: userId,
        equipped_items: {},
        total_value: 0,
        rarity_score: 0,
        style_rating: avatarData.stats.style,
        last_updated: avatarData.lastModified
      };

      for (const [slot, item] of Object.entries(avatarData.equipped)) {
        if (item) {
          // Get full item details
          const itemDetails = await this.getItemFullDetails(item.itemId);
          showcase.equipped_items[slot] = {
            ...item,
            ...itemDetails,
            slot
          };
          
          showcase.total_value += itemDetails.price || 0;
          showcase.rarity_score += this.getRarityBonus(item.rarity);
        }
      }

      return showcase;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'get_avatar_showcase',
        user_id: userId
      });
      throw error;
    }
  }

  async getItemFullDetails(itemId) {
    // First check standard gear
    const standardGear = this.getStandardGearCatalog();
    for (const category of Object.values(standardGear)) {
      const item = category.find(item => item.id === itemId);
      if (item) return item;
    }

    // Then check collectibles/shop items
    try {
      const shopQuery = query(
        collection(db, 'collectableItems'),
        where('itemId', '==', itemId)
      );
      
      const shopSnapshot = await getDocs(shopQuery);
      if (!shopSnapshot.empty) {
        return shopSnapshot.docs[0].data();
      }
    } catch (error) {
      // Fallback for unknown items
    }

    return {
      name: 'Unknown Item',
      description: 'Item details not available',
      price: 0,
      rarity: 'standard'
    };
  }

  // AVATAR PRESETS & TEMPLATES

  async saveAvatarPreset(userId, presetName, description) {
    try {
      const avatarData = await this.getUserAvatar(userId);
      
      const preset = {
        name: presetName,
        description,
        creator_id: userId,
        equipped: avatarData.equipped,
        appearance: avatarData.appearance,
        poses: avatarData.poses,
        stats: avatarData.stats,
        created_at: serverTimestamp(),
        is_public: false,
        uses_count: 0,
        likes: 0
      };

      const presetRef = await addDoc(collection(db, 'avatarPresets'), preset);

      analyticsService.logEvent('avatar_preset_saved', {
        category: EventCategory.AVATAR,
        user_id: userId,
        preset_id: presetRef.id,
        preset_name: presetName
      });

      return { success: true, presetId: presetRef.id };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'save_preset',
        user_id: userId
      });
      throw error;
    }
  }

  async loadAvatarPreset(userId, presetId) {
    try {
      const presetDoc = await getDoc(doc(db, 'avatarPresets', presetId));
      if (!presetDoc.exists()) {
        throw new Error('Preset not found');
      }

      const presetData = presetDoc.data();
      
      // Verify user owns all required items
      const missingItems = await this.checkPresetRequirements(userId, presetData.equipped);
      if (missingItems.length > 0) {
        return {
          success: false,
          error: 'Missing required items',
          missingItems
        };
      }

      // Apply preset to user avatar
      const avatarRef = doc(db, 'userAvatars', userId);
      await updateDoc(avatarRef, {
        equipped: presetData.equipped,
        appearance: presetData.appearance,
        poses: presetData.poses,
        lastModified: serverTimestamp()
      });

      // Update preset usage count
      await updateDoc(doc(db, 'avatarPresets', presetId), {
        uses_count: increment(1)
      });

      return { success: true };
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'avatar_system',
        action: 'load_preset',
        user_id: userId,
        preset_id: presetId
      });
      throw error;
    }
  }

  async checkPresetRequirements(userId, equippedItems) {
    const missingItems = [];
    
    for (const [slot, item] of Object.entries(equippedItems)) {
      if (item) {
        const inventoryQuery = query(
          collection(db, 'userInventory', userId, 'items'),
          where('itemId', '==', item.itemId)
        );
        
        const inventorySnapshot = await getDocs(inventoryQuery);
        if (inventorySnapshot.empty) {
          missingItems.push({
            slot,
            itemId: item.itemId,
            name: item.name
          });
        }
      }
    }

    return missingItems;
  }
}

export default new AvatarSystemService();
