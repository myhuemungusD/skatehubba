import { db } from './firebase';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import AvatarSystemService from './avatarSystemService';

class AvatarUIService {
  constructor() {
    this.currentCustomization = {};
    this.previewMode = false;
    this.animationQueue = [];
  }

  // ONBOARDING AVATAR CREATOR

  getOnboardingFlow() {
    return {
      steps: [
        {
          id: 'welcome',
          title: 'Create Your Skater',
          description: 'Express yourself with our avatar creator',
          component: 'WelcomeStep',
          duration: 3000
        },
        {
          id: 'skin_tone',
          title: 'Choose Your Look',
          description: 'Select your skin tone',
          component: 'SkinToneSelector',
          required: true
        },
        {
          id: 'shoes',
          title: 'Pick Your Kicks',
          description: 'Choose from classic skate shoe styles',
          component: 'ShoeSelector',
          required: true
        },
        {
          id: 'pants',
          title: 'Bottom Half',
          description: 'Select your preferred pants or shorts',
          component: 'PantsSelector',
          required: true
        },
        {
          id: 'tops',
          title: 'Top Style',
          description: 'Pick your shirt or hoodie',
          component: 'TopSelector',
          required: true
        },
        {
          id: 'hair',
          title: 'Hair & Head',
          description: 'Choose your hairstyle',
          component: 'HairSelector',
          required: true
        },
        {
          id: 'headwear',
          title: 'Headwear (Optional)',
          description: 'Add a hat or beanie',
          component: 'HeadwearSelector',
          required: false
        },
        {
          id: 'presets',
          title: 'Quick Styles',
          description: 'Or choose from preset looks',
          component: 'PresetSelector',
          required: false
        },
        {
          id: 'preview',
          title: 'Looking Fresh!',
          description: 'Review your avatar',
          component: 'AvatarPreview',
          duration: 2000
        },
        {
          id: 'complete',
          title: 'Welcome to SkateHubba!',
          description: 'Your avatar is ready to skate',
          component: 'CompletionStep',
          duration: 2000
        }
      ],
      totalSteps: 10,
      estimatedTime: '2-3 minutes'
    };
  }

  // SKIN TONE SELECTION UI

  getSkinToneSelectionUI() {
    const skinTones = AvatarSystemService.getSkinToneOptions();
    
    return {
      title: 'Choose Your Skin Tone',
      subtitle: 'This represents you in the skate community',
      options: skinTones.map(tone => ({
        id: tone.id,
        name: tone.name,
        description: tone.description,
        color: tone.hexColor,
        preview: {
          circle: tone.hexColor,
          gradient: this.generateSkinGradient(tone.hexColor),
          sample: `/assets/avatar/skin_samples/${tone.id}.png`
        },
        accessibility: {
          label: `Select ${tone.name} skin tone`,
          description: `${tone.description} skin tone option`
        }
      })),
      layout: 'horizontal_cards',
      selectionStyle: 'radio',
      tips: [
        'This choice represents your identity in SkateHubba',
        'You can always change this later in your profile',
        'All gear looks great on every skin tone!'
      ]
    };
  }

  // GEAR SELECTION UI GENERATORS

  getShoeSelectionUI() {
    const shoes = AvatarSystemService.getStandardGearCatalog().shoes;
    
    return {
      title: 'Pick Your Kicks',
      subtitle: 'Choose your signature skate shoes',
      categories: [
        {
          name: 'Vulc Classics',
          description: 'Low-profile vulcanized shoes for board feel',
          items: shoes.filter(shoe => shoe.name === 'Vulc Classic'),
          style: 'board_feel'
        },
        {
          name: 'Tech Runners',
          description: 'Cupsole construction for impact protection',
          items: shoes.filter(shoe => shoe.name === 'Tech Runner'),
          style: 'protection'
        },
        {
          name: 'Park Cruisers',
          description: 'Slip-on convenience for quick sessions',
          items: shoes.filter(shoe => shoe.name === 'Park Cruiser'),
          style: 'convenience'
        }
      ],
      itemDisplay: this.generateGearDisplayData(shoes),
      selectionTips: [
        'Each style affects your skate stats slightly',
        'Vulc = Better board feel',
        'Cupsole = More protection', 
        'Slip-on = Quick on/off'
      ],
      layout: 'category_grid'
    };
  }

  getPantsSelectionUI() {
    const pants = AvatarSystemService.getStandardGearCatalog().pants;
    
    return {
      title: 'Bottom Half Style',
      subtitle: 'Comfort and style for your sessions',
      categories: [
        {
          name: 'Denim',
          description: 'Classic loose-fit jeans',
          items: pants.filter(item => item.name === 'Loose Jeans'),
          vibe: 'classic'
        },
        {
          name: 'Cargo',
          description: 'Practical shorts with pockets',
          items: pants.filter(item => item.name === 'Cargo Shorts'),
          vibe: 'utility'
        },
        {
          name: 'Chinos',
          description: 'Clean straight-leg style',
          items: pants.filter(item => item.name === 'Straight Chinos'),
          vibe: 'clean'
        }
      ],
      itemDisplay: this.generateGearDisplayData(pants),
      seasonalTips: this.getSeasonalGearTips('pants'),
      layout: 'mixed_grid'
    };
  }

  getTopSelectionUI() {
    const tops = AvatarSystemService.getStandardGearCatalog().tops;
    
    return {
      title: 'Top Style',
      subtitle: 'Express your personality',
      categories: [
        {
          name: 'Tees',
          description: 'Boxy comfort for warm sessions',
          items: tops.filter(item => item.name === 'Boxy Tee'),
          weather: 'warm'
        },
        {
          name: 'Hoodies',
          description: 'Cozy warmth for cool days',
          items: tops.filter(item => item.name === 'Pullover Hoodie'),
          weather: 'cool'
        }
      ],
      itemDisplay: this.generateGearDisplayData(tops),
      layeringTips: [
        'Hoodies work great over tees',
        'Bold colors make you stand out',
        'Neutral tones match everything'
      ],
      layout: 'split_categories'
    };
  }

  getHairSelectionUI() {
    const hair = AvatarSystemService.getStandardGearCatalog().hair;
    
    return {
      title: 'Hair & Style',
      subtitle: 'Complete your look',
      categories: [
        {
          name: 'Short Styles',
          description: 'Low maintenance, high style',
          items: hair.filter(item => item.name === 'Short Hair'),
          maintenance: 'low'
        },
        {
          name: 'Long Styles', 
          description: 'Flow with your skating',
          items: hair.filter(item => item.name === 'Long Hair'),
          maintenance: 'medium'
        }
      ],
      itemDisplay: this.generateGearDisplayData(hair),
      styleNotes: [
        'Hair flows with trick animations',
        'Some headwear hides hair completely',
        'Color affects overall avatar vibe'
      ],
      layout: 'hair_preview'
    };
  }

  getHeadwearSelectionUI() {
    const headwear = AvatarSystemService.getStandardGearCatalog().headwear;
    
    return {
      title: 'Headwear (Optional)',
      subtitle: 'Add some extra style',
      includeNone: true,
      categories: [
        {
          name: 'Beanies',
          description: 'Cozy knit warmth',
          items: headwear.filter(item => item.name === 'Beanie'),
          season: 'winter'
        },
        {
          name: 'Baseball Caps',
          description: 'Classic six-panel style',
          items: headwear.filter(item => item.name === 'Baseball Cap'),
          season: 'all'
        }
      ],
      itemDisplay: this.generateGearDisplayData(headwear),
      combinationTips: [
        'Headwear changes your silhouette',
        'Some styles hide hair completely',
        'Mix and match with outfits'
      ],
      layout: 'optional_grid'
    };
  }

  // PRESET SYSTEM UI

  getPresetSelectionUI() {
    const presets = AvatarSystemService.getAvatarPresets();
    
    return {
      title: 'Quick Style Presets',
      subtitle: 'Jump start with curated looks',
      presets: presets.map(preset => ({
        ...preset,
        preview: this.generatePresetPreview(preset),
        popularity: this.getPresetPopularity(preset.id),
        vibe: this.getPresetVibe(preset)
      })),
      customOption: {
        id: 'custom',
        name: 'Keep My Custom',
        description: 'Stick with your current selections',
        icon: '🎨'
      },
      layout: 'preset_cards',
      tips: [
        'Presets are starting points - customize later!',
        'Popular with other skaters',
        'You can always mix and match pieces'
      ]
    };
  }

  // AVATAR PREVIEW & FINALIZATION

  getAvatarPreviewUI(avatarData) {
    return {
      title: 'Looking Fresh! 🔥',
      subtitle: 'Your avatar is ready to hit the streets',
      preview: {
        model: this.generateAvatarPreviewModel(avatarData),
        animations: ['idle', 'kickflip_preview', 'victory_pose'],
        lighting: 'studio',
        background: 'skate_park_preview'
      },
      stats: this.calculateAvatarStats(avatarData),
      gearBreakdown: this.generateGearBreakdown(avatarData),
      shareOptions: [
        {
          platform: 'camera_roll',
          label: 'Save Avatar Screenshot',
          icon: '📷'
        },
        {
          platform: 'social_media',
          label: 'Share Your Style',
          icon: '📱'
        }
      ],
      nextSteps: [
        'Unlock rare gear by skating challenges',
        'Show off your style in sessions',
        'Customize anytime in your profile'
      ]
    };
  }

  getCompletionUI() {
    return {
      title: 'Welcome to SkateHubba! 🛹',
      subtitle: 'You\'re all set to start skating',
      celebration: {
        animation: 'confetti_burst',
        sound: 'success_chime',
        duration: 3000
      },
      nextActions: [
        {
          id: 'first_challenge',
          title: 'Take Your First Challenge',
          description: 'Complete a trick to earn XP and Hubba Bucks',
          icon: '🎯',
          action: 'navigate_to_challenges'
        },
        {
          id: 'explore_features',
          title: 'Explore Features',
          description: 'Check out all SkateHubba has to offer',
          icon: '🗺️',
          action: 'show_app_tour'
        },
        {
          id: 'join_session',
          title: 'Find a Session',
          description: 'Connect with skaters near you',
          icon: '👥',
          action: 'navigate_to_sessions'
        }
      ],
      achievements: [
        {
          id: 'avatar_created',
          title: 'Style Icon',
          description: 'Created your first avatar',
          reward: '50 XP'
        }
      ]
    };
  }

  // AVATAR CUSTOMIZATION (POST-ONBOARDING)

  getCustomizationMenu() {
    return {
      title: 'Customize Avatar',
      sections: [
        {
          id: 'standard_gear',
          title: 'Standard Gear',
          description: 'Free gear - mix and match anytime',
          icon: '👕',
          unlocked: true
        },
        {
          id: 'collectible_gear',
          title: 'Collectible Gear',
          description: 'Rare items from your collection',
          icon: '💎',
          unlocked: true,
          premium: true
        },
        {
          id: 'avatar_settings',
          title: 'Avatar Settings',
          description: 'Name, skin tone, and preferences',
          icon: '⚙️',
          unlocked: true
        },
        {
          id: 'showcase_settings',
          title: 'Showcase Settings',
          description: 'How others see your avatar',
          icon: '🎭',
          unlocked: true
        }
      ],
      quickActions: [
        {
          id: 'random_outfit',
          title: 'Random Outfit',
          description: 'Generate a random look',
          icon: '🎲'
        },
        {
          id: 'save_outfit',
          title: 'Save Outfit',
          description: 'Save current look as preset',
          icon: '💾'
        },
        {
          id: 'share_avatar',
          title: 'Share Avatar',
          description: 'Show off your style',
          icon: '📤'
        }
      ]
    };
  }

  // UTILITY FUNCTIONS

  generateGearDisplayData(gearArray) {
    return gearArray.map(item => ({
      ...item,
      preview: {
        thumbnail: `/assets/avatar/thumbnails/${item.id}_thumb.png`,
        model: item.model.meshPath,
        texture: item.model.texturePath,
        colorPreview: this.generateColorPreview(item.colors)
      },
      ui: {
        displayName: `${item.name} - ${item.colorway}`,
        description: item.description,
        tags: item.tags,
        rarityIndicator: this.getRarityIndicator(item.rarity)
      }
    }));
  }

  generateColorPreview(colors) {
    return {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      gradient: `linear-gradient(45deg, ${colors.primary}, ${colors.secondary})`,
      palette: [colors.primary, colors.secondary, colors.accent]
    };
  }

  getRarityIndicator(rarity) {
    const indicators = {
      standard: { color: '#8E8E93', label: 'Standard', icon: '⭐' },
      rare: { color: '#007AFF', label: 'Rare', icon: '💎' },
      ultra_rare: { color: '#5856D6', label: 'Ultra Rare', icon: '✨' },
      legendary: { color: '#FF9500', label: 'Legendary', icon: '🔥' },
      mythic: { color: '#FF2D92', label: 'Mythic', icon: '👑' }
    };
    return indicators[rarity] || indicators.standard;
  }

  generateSkinGradient(baseColor) {
    // Create subtle gradient for skin tone preview
    const rgb = this.hexToRgb(baseColor);
    const lighter = this.adjustBrightness(rgb, 20);
    const darker = this.adjustBrightness(rgb, -20);
    
    return `linear-gradient(135deg, ${this.rgbToHex(lighter)}, ${baseColor}, ${this.rgbToHex(darker)})`;
  }

  generatePresetPreview(preset) {
    return {
      thumbnail: `/assets/avatar/presets/${preset.id}_preview.png`,
      gearHighlights: preset.gear,
      vibe: preset.tags,
      popularityScore: Math.floor(Math.random() * 100) + 1 // Simulated
    };
  }

  getPresetPopularity(presetId) {
    // Simulated popularity data
    const popularity = {
      street_classic: 85,
      park_rider: 72,
      minimalist: 68,
      old_school: 91
    };
    return popularity[presetId] || 50;
  }

  getPresetVibe(preset) {
    const vibes = {
      classic: { emoji: '🔥', description: 'Timeless style' },
      technical: { emoji: '⚡', description: 'Performance focused' },
      minimal: { emoji: '✨', description: 'Clean aesthetic' },
      retro: { emoji: '📼', description: 'Throwback vibes' }
    };
    
    const mainTag = preset.tags[0];
    return vibes[mainTag] || { emoji: '🛹', description: 'Skate style' };
  }

  generateAvatarPreviewModel(avatarData) {
    return {
      baseModel: '/assets/avatar/base/skater_base.obj',
      skinTone: avatarData.skinTone,
      gear: avatarData.selectedGear,
      pose: 'preview_stance',
      lighting: 'three_point',
      environment: 'studio_backdrop'
    };
  }

  calculateAvatarStats(avatarData) {
    return {
      style: Math.floor(Math.random() * 20) + 80, // 80-100 range
      uniqueness: Math.floor(Math.random() * 30) + 70, // 70-100 range
      versatility: Math.floor(Math.random() * 25) + 75, // 75-100 range
      gearCount: Object.keys(avatarData.selectedGear || {}).length
    };
  }

  generateGearBreakdown(avatarData) {
    const breakdown = {};
    const standardCatalog = AvatarSystemService.getStandardGearCatalog();
    
    Object.entries(avatarData.selectedGear || {}).forEach(([category, itemId]) => {
      const categoryItems = standardCatalog[category] || [];
      const item = categoryItems.find(i => i.id === itemId);
      
      if (item) {
        breakdown[category] = {
          name: item.name,
          colorway: item.colorway,
          description: item.description,
          rarity: item.rarity,
          preview: `/assets/avatar/thumbnails/${item.id}_thumb.png`
        };
      }
    });
    
    return breakdown;
  }

  getSeasonalGearTips(category) {
    const tips = {
      pants: {
        summer: 'Shorts keep you cool during long sessions',
        winter: 'Jeans provide protection and warmth',
        spring: 'Mix and match based on weather',
        fall: 'Layer with different tops'
      },
      tops: {
        summer: 'Light tees for hot skate sessions',
        winter: 'Hoodies for warmth and style',
        spring: 'Perfect hoodie weather',
        fall: 'Transition to warmer layers'
      }
    };
    
    const currentSeason = this.getCurrentSeason();
    return tips[category]?.[currentSeason] || 'Choose what feels right for you!';
  }

  getCurrentSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  // COLOR UTILITY FUNCTIONS

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  rgbToHex(rgb) {
    const componentToHex = (c) => {
      const hex = Math.round(c).toString(16);
      return hex.length == 1 ? "0" + hex : hex;
    };
    return `#${componentToHex(rgb.r)}${componentToHex(rgb.g)}${componentToHex(rgb.b)}`;
  }

  adjustBrightness(rgb, amount) {
    return {
      r: Math.max(0, Math.min(255, rgb.r + amount)),
      g: Math.max(0, Math.min(255, rgb.g + amount)),
      b: Math.max(0, Math.min(255, rgb.b + amount))
    };
  }

  // ANIMATION HELPERS

  queueAnimation(animationType, target, duration = 1000) {
    const animation = {
      id: `anim_${Date.now()}`,
      type: animationType,
      target,
      duration,
      startTime: Date.now()
    };
    
    this.animationQueue.push(animation);
    return animation.id;
  }

  clearAnimations() {
    this.animationQueue = [];
  }

  // ANALYTICS TRACKING

  trackAvatarCreationStep(step, data = {}) {
    analyticsService.logEvent(`avatar_creation_${step}`, {
      category: EventCategory.AVATAR,
      step,
      ...data
    });
  }

  trackGearSelection(category, itemId, rarity = 'standard') {
    analyticsService.logEvent('avatar_gear_selected', {
      category: EventCategory.AVATAR,
      gear_category: category,
      item_id: itemId,
      rarity
    });
  }

  trackPresetUsage(presetId) {
    analyticsService.logEvent('avatar_preset_used', {
      category: EventCategory.AVATAR,
      preset_id: presetId
    });
  }
}

export default new AvatarUIService();
