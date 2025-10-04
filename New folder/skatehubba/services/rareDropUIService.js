import { db } from './firebase';
import { 
  collection, 
  doc, 
  onSnapshot,
  query, 
  where, 
  orderBy
} from 'firebase/firestore';
import { analyticsService, EventCategory } from './analytics';
import GlobalErrorHandler from './errorHandler';
import FirstRareDropService from './firstRareDropService';

class RareDropUIService {
  constructor() {
    this.liveStockWatchers = new Map();
    this.animationTimers = new Map();
    this.hypeEffects = new Map();
  }

  // MAIN DROP SHOP DISPLAY

  getDropShopLayout() {
    const dropUI = FirstRareDropService.getDropMarketplaceUI();
    
    return {
      header: {
        title: '🔥 OG LEGENDS COLLECTION',
        subtitle: 'The most iconic pieces from skateboarding\'s golden era',
        countdown: dropUI.hero.countdown,
        backgroundVideo: '/assets/drops/og_legends_hero_video.mp4',
        particles: 'legendary_golden_particles',
        statusBadge: {
          text: dropUI.hero.status,
          color: dropUI.hero.status === 'LIVE NOW' ? '#00FF00' : '#FF9500',
          pulse: dropUI.hero.status === 'LIVE NOW'
        }
      },

      featuredItem: this.buildFeaturedItemCard(dropUI.featuredItem),

      categories: dropUI.categories.map(category => ({
        ...category,
        headerStyle: this.getCategoryHeaderStyle(category.name),
        grid: this.buildCategoryGrid(category)
      })),

      stats: {
        ...dropUI.stats,
        display: this.buildStatsDisplay(dropUI.stats)
      },

      liveElements: {
        stockTicker: this.buildStockTicker(),
        recentPurchases: this.buildRecentPurchasesFeed(),
        hypeCounter: this.buildHypeCounter()
      }
    };
  }

  // FEATURED ITEM SHOWCASE

  buildFeaturedItemCard(item) {
    return {
      container: {
        background: 'radial-gradient(circle, rgba(255,215,0,0.1) 0%, rgba(255,165,0,0.05) 100%)',
        border: '2px solid #FFD700',
        boxShadow: '0 0 30px rgba(255,215,0,0.3)',
        borderRadius: '16px',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      },

      badge: {
        text: '👑 MOST HYPED',
        position: 'top-right',
        background: 'linear-gradient(45deg, #FFD700, #FFA500)',
        color: '#000',
        fontWeight: 'bold',
        padding: '8px 16px',
        borderRadius: '20px',
        animation: 'pulse 2s infinite'
      },

      model: {
        src: item.model.meshPath,
        rotation: 'auto-rotate',
        lighting: 'studio-premium',
        background: 'transparent',
        effects: ['legendary_aura', 'golden_particles'],
        cameraAngle: 'hero_showcase'
      },

      info: {
        title: item.name,
        subtitle: item.description,
        rarity: {
          text: 'LEGENDARY',
          color: '#FFD700',
          glow: true
        },
        price: {
          amount: this.formatPrice(item.price),
          emphasize: true,
          currency: 'Hubba Bucks'
        },
        stock: {
          remaining: item.remainingStock,
          total: item.totalProduction,
          urgency: item.remainingStock <= 10 ? 'critical' : 'high',
          text: `Only ${item.remainingStock} of ${item.totalProduction} left!`
        }
      },

      actions: {
        primaryButton: {
          text: 'BUY NOW',
          style: 'legendary',
          animation: 'glow-pulse',
          disabled: item.remainingStock === 0
        },
        secondaryButton: {
          text: 'View Details',
          style: 'outline-gold'
        },
        wishlistButton: {
          icon: '♥',
          text: 'Add to Wishlist',
          style: 'minimal'
        }
      },

      liveData: {
        viewCount: item.viewCount || 0,
        recentActivity: 'Last bought 2 minutes ago',
        hypeLevel: item.hypeLevel
      }
    };
  }

  // CATEGORY GRIDS

  buildCategoryGrid(category) {
    return {
      layout: 'responsive-grid',
      columns: { mobile: 1, tablet: 2, desktop: 3 },
      gap: '24px',
      items: category.items.map(item => this.buildItemCard(item, category.rarityGlow))
    };
  }

  buildItemCard(item, rarityGlow) {
    const stockPercentage = (item.remainingStock / item.totalProduction) * 100;
    const isLowStock = stockPercentage <= 20;
    const isCriticalStock = stockPercentage <= 10;

    return {
      container: {
        background: this.getCardBackground(item.rarity),
        border: this.getCardBorder(item.rarity),
        borderRadius: '12px',
        padding: '20px',
        position: 'relative',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        hover: {
          transform: 'translateY(-8px)',
          boxShadow: this.getCardHoverShadow(item.rarity)
        }
      },

      rarityBadge: {
        text: item.rarity.toUpperCase().replace('_', ' '),
        color: this.getRarityColor(item.rarity),
        background: this.getRarityBackground(item.rarity),
        position: 'top-left',
        glow: rarityGlow
      },

      stockIndicator: {
        position: 'top-right',
        text: `${item.remainingStock}/${item.totalProduction}`,
        color: isCriticalStock ? '#FF0000' : isLowStock ? '#FF9500' : '#00FF00',
        background: 'rgba(0,0,0,0.7)',
        padding: '4px 8px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 'bold',
        animation: isCriticalStock ? 'flash 1s infinite' : 'none'
      },

      modelPreview: {
        src: item.model.meshPath,
        thumbnail: `/assets/collectibles/thumbnails/${item.id}_card.png`,
        aspectRatio: '1:1',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        effects: this.getPreviewEffects(item.rarity),
        loadingPlaceholder: this.getLoadingPlaceholder(item.category)
      },

      details: {
        name: {
          text: item.name,
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#FFFFFF',
          marginBottom: '8px'
        },
        description: {
          text: item.description,
          fontSize: '14px',
          color: '#CCCCCC',
          lineHeight: '1.4',
          maxLines: 2
        },
        era: {
          text: item.design.era,
          fontSize: '12px',
          color: this.getRarityColor(item.rarity),
          fontStyle: 'italic',
          marginTop: '4px'
        }
      },

      pricing: {
        amount: {
          text: this.formatPrice(item.price),
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#FFD700'
        },
        currency: {
          text: 'Hubba Bucks',
          fontSize: '12px',
          color: '#999999'
        },
        specialSerialNote: Object.keys(item.specialSerials || {}).length > 0 ? 
          'Special serials available' : null
      },

      urgencyElements: this.buildUrgencyElements(item),

      actions: {
        buyButton: {
          text: 'BUY NOW',
          style: this.getBuyButtonStyle(item.rarity),
          fullWidth: true,
          disabled: item.remainingStock === 0
        },
        quickActions: [
          { icon: '👁', tooltip: 'Quick View' },
          { icon: '♥', tooltip: 'Add to Wishlist' },
          { icon: '📤', tooltip: 'Share' }
        ]
      },

      liveUpdates: {
        lastSold: item.lastSoldAt ? this.timeAgo(item.lastSoldAt) : null,
        popularity: this.getPopularityIndicator(item.hypeLevel),
        trending: this.isTrending(item)
      }
    };
  }

  // URGENCY & FOMO ELEMENTS

  buildUrgencyElements(item) {
    const stockPercentage = (item.remainingStock / item.totalProduction) * 100;
    const elements = [];

    // Critical stock warning
    if (stockPercentage <= 10) {
      elements.push({
        type: 'critical_stock',
        text: '🚨 ALMOST SOLD OUT!',
        style: {
          background: 'linear-gradient(45deg, #FF0000, #FF4444)',
          color: '#FFFFFF',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 'bold',
          textAlign: 'center',
          animation: 'flash 1s infinite'
        }
      });
    } else if (stockPercentage <= 25) {
      elements.push({
        type: 'low_stock',
        text: '⚠️ LIMITED STOCK',
        style: {
          background: 'linear-gradient(45deg, #FF9500, #FFAA00)',
          color: '#000000',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 'bold',
          textAlign: 'center'
        }
      });
    }

    // Rarity emphasis
    if (item.rarity === 'legendary') {
      elements.push({
        type: 'legendary_status',
        text: '👑 LEGENDARY STATUS',
        style: {
          background: 'linear-gradient(45deg, #FFD700, #FFA500)',
          color: '#000000',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 'bold'
        }
      });
    }

    // Recent activity
    if (item.lastSoldAt && (Date.now() - new Date(item.lastSoldAt).getTime()) < 300000) {
      elements.push({
        type: 'recent_sale',
        text: '🔥 JUST SOLD!',
        style: {
          background: 'rgba(255, 100, 100, 0.8)',
          color: '#FFFFFF',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          animation: 'fade-in-out 3s'
        }
      });
    }

    return elements;
  }

  // LIVE ELEMENTS

  buildStockTicker() {
    return {
      container: {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.9)',
        color: '#FFFFFF',
        padding: '12px',
        borderRadius: '8px',
        zIndex: 1000
      },
      content: {
        scrolling: true,
        speed: 'slow',
        items: [
          '🔥 Muska Highs: 23 left!',
          '⚡ Koston Lows: 31 left!', 
          '🟡 Osiris D3: 67 left!',
          '🖤 Shorty\'s Tee: 8 left!',
          '🛹 Muska Board: 45 left!',
          '🔴 Baker Board: 52 left!',
          '🧢 Thrasher Hat: 234 left!'
        ]
      }
    };
  }

  buildRecentPurchasesFeed() {
    return {
      container: {
        position: 'fixed',
        top: '100px',
        right: '20px',
        width: '300px',
        maxHeight: '400px',
        overflow: 'hidden'
      },
      items: [
        {
          text: 'Someone just bought Koston Lows #24!',
          time: '2m ago',
          animation: 'slide-in-right'
        },
        {
          text: 'Muska Highs #7 sold!',
          time: '5m ago',
          animation: 'slide-in-right'
        },
        {
          text: 'Baker Board #33 purchased!',
          time: '8m ago',
          animation: 'slide-in-right'
        }
      ],
      updateInterval: 30000 // 30 seconds
    };
  }

  buildHypeCounter() {
    return {
      container: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'linear-gradient(45deg, #FF6B6B, #FF8E53)',
        color: '#FFFFFF',
        padding: '16px',
        borderRadius: '12px',
        textAlign: 'center'
      },
      content: {
        title: '🔥 HYPE METER',
        value: '94%',
        subtitle: 'Community Excitement',
        animation: 'pulse-glow'
      }
    };
  }

  // PURCHASE MODAL

  getPurchaseModalUI(itemId) {
    const item = this.getItemById(itemId);
    if (!item) return null;

    return {
      modal: {
        size: 'large',
        background: 'rgba(0, 0, 0, 0.95)',
        borderRadius: '16px',
        maxWidth: '800px',
        padding: '0'
      },

      header: {
        background: this.getModalHeaderBackground(item.rarity),
        padding: '24px',
        borderRadius: '16px 16px 0 0',
        content: {
          title: item.name,
          subtitle: item.description,
          rarity: item.rarity,
          closeButton: true
        }
      },

      body: {
        layout: 'two-column',
        leftColumn: {
          width: '60%',
          content: {
            avatar3DPreview: {
              model: item.model.meshPath,
              backgrounds: ['studio', 'skate_park', 'street'],
              lighting: 'premium',
              effects: this.getPreviewEffects(item.rarity),
              controls: {
                rotate: true,
                zoom: true,
                animations: ['idle', 'showcase']
              }
            },
            itemDetails: {
              description: item.description,
              era: item.design.era,
              inspiration: item.design.inspiration,
              details: item.design.details,
              materials: this.getMaterialInfo(item.model)
            }
          }
        },
        rightColumn: {
          width: '40%',
          content: {
            purchaseInfo: {
              price: {
                base: item.price,
                formatted: this.formatPrice(item.price),
                currency: 'Hubba Bucks'
              },
              stock: {
                remaining: item.remainingStock,
                total: item.totalProduction,
                percentage: (item.remainingStock / item.totalProduction) * 100
              },
              serialSelection: this.buildSerialSelector(item)
            }
          }
        }
      },

      footer: {
        background: '#1a1a1a',
        padding: '24px',
        borderRadius: '0 0 16px 16px',
        content: {
          warnings: [
            '⚠️ Limited quantity - once sold out, gone forever!',
            '🎲 Serial numbers assigned randomly or by choice',
            '🚫 All sales are final - no refunds',
            '🔄 Items become tradeable immediately after purchase'
          ],
          actions: {
            buyButton: {
              text: 'CONFIRM PURCHASE',
              style: this.getBuyButtonStyle(item.rarity),
              size: 'large',
              disabled: item.remainingStock === 0
            },
            cancelButton: {
              text: 'Cancel',
              style: 'outline'
            }
          }
        }
      }
    };
  }

  buildSerialSelector(item) {
    const availableSerials = item.serialNumbers
      .filter(serial => serial.isAvailable)
      .slice(0, 20); // Show first 20 available

    return {
      title: 'Choose Your Serial Number',
      subtitle: 'Each piece is uniquely numbered',
      options: [
        {
          value: 'random',
          label: 'Surprise Me! (Random Serial)',
          price: item.price,
          recommended: true
        },
        ...availableSerials.map(serial => ({
          value: serial.number,
          label: `#${serial.number}${serial.isSpecial ? ' ⭐ SPECIAL' : ''}`,
          description: serial.description,
          price: item.price + Math.round(item.price * (serial.premium || 0)),
          premium: serial.premium > 0,
          special: serial.isSpecial
        }))
      ],
      display: {
        layout: 'grid',
        columns: 4,
        specialHighlight: true
      }
    };
  }

  // UTILITY FUNCTIONS

  getCardBackground(rarity) {
    const backgrounds = {
      rare: 'linear-gradient(135deg, rgba(0, 122, 255, 0.1) 0%, rgba(0, 122, 255, 0.05) 100%)',
      ultra_rare: 'linear-gradient(135deg, rgba(88, 86, 214, 0.1) 0%, rgba(88, 86, 214, 0.05) 100%)',
      legendary: 'linear-gradient(135deg, rgba(255, 149, 0, 0.1) 0%, rgba(255, 149, 0, 0.05) 100%)'
    };
    return backgrounds[rarity] || backgrounds.rare;
  }

  getCardBorder(rarity) {
    const borders = {
      rare: '1px solid rgba(0, 122, 255, 0.3)',
      ultra_rare: '1px solid rgba(88, 86, 214, 0.3)',
      legendary: '2px solid rgba(255, 149, 0, 0.5)'
    };
    return borders[rarity] || borders.rare;
  }

  getCardHoverShadow(rarity) {
    const shadows = {
      rare: '0 20px 40px rgba(0, 122, 255, 0.3)',
      ultra_rare: '0 20px 40px rgba(88, 86, 214, 0.3)',
      legendary: '0 25px 50px rgba(255, 149, 0, 0.4)'
    };
    return shadows[rarity] || shadows.rare;
  }

  getRarityColor(rarity) {
    const colors = {
      rare: '#007AFF',
      ultra_rare: '#5856D6',
      legendary: '#FF9500'
    };
    return colors[rarity] || colors.rare;
  }

  getRarityBackground(rarity) {
    const backgrounds = {
      rare: 'rgba(0, 122, 255, 0.2)',
      ultra_rare: 'rgba(88, 86, 214, 0.2)',
      legendary: 'rgba(255, 149, 0, 0.2)'
    };
    return backgrounds[rarity] || backgrounds.rare;
  }

  getPreviewEffects(rarity) {
    const effects = {
      rare: ['blue_glow'],
      ultra_rare: ['purple_glow', 'sparkle'],
      legendary: ['golden_glow', 'particles', 'shimmer']
    };
    return effects[rarity] || effects.rare;
  }

  getBuyButtonStyle(rarity) {
    const styles = {
      rare: 'gradient-blue',
      ultra_rare: 'gradient-purple',
      legendary: 'gradient-gold'
    };
    return styles[rarity] || styles.rare;
  }

  getModalHeaderBackground(rarity) {
    const backgrounds = {
      rare: 'linear-gradient(45deg, #007AFF, #0051D0)',
      ultra_rare: 'linear-gradient(45deg, #5856D6, #3730A3)',
      legendary: 'linear-gradient(45deg, #FF9500, #F59E0B)'
    };
    return backgrounds[rarity] || backgrounds.rare;
  }

  formatPrice(price) {
    if (price >= 1000) {
      return `${(price / 1000).toFixed(1)}K`;
    }
    return price.toLocaleString();
  }

  timeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  getPopularityIndicator(hypeLevel) {
    if (hypeLevel >= 90) return { icon: '🔥🔥🔥', text: 'EXTREMELY HOT' };
    if (hypeLevel >= 80) return { icon: '🔥🔥', text: 'VERY HOT' };
    if (hypeLevel >= 70) return { icon: '🔥', text: 'HOT' };
    return { icon: '📈', text: 'TRENDING' };
  }

  isTrending(item) {
    return item.hypeLevel > 85 || (item.remainingStock / item.totalProduction) < 0.3;
  }

  // REAL-TIME UPDATES

  subscribeToLiveUpdates(callback) {
    try {
      const q = query(
        collection(db, 'collectableItems'),
        where('dropId', '==', 'first_rare_drop_2025')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const updates = [];
        snapshot.docChanges().forEach(change => {
          if (change.type === 'modified') {
            const item = { id: change.doc.id, ...change.doc.data() };
            updates.push({
              type: 'stock_update',
              itemId: item.id,
              remainingStock: item.remainingStock,
              lastSoldAt: item.lastSoldAt
            });
          }
        });
        
        if (updates.length > 0) {
          callback(updates);
        }
      });

      return unsubscribe;
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'rare_drop_ui',
        action: 'subscribe_to_live_updates'
      });
      return () => {};
    }
  }

  getItemById(itemId) {
    const catalog = FirstRareDropService.getFirstRareDropCatalog();
    return catalog.items.find(item => item.id === itemId);
  }

  getMaterialInfo(model) {
    return {
      polygonCount: model.polygonCount || 0,
      textureResolution: '2048x2048',
      materialMaps: ['Diffuse', 'Normal', 'Roughness', 'Metallic'],
      renderQuality: 'Premium'
    };
  }

  getLoadingPlaceholder(category) {
    const placeholders = {
      shoes: '/assets/placeholders/shoe_loading.png',
      tops: '/assets/placeholders/shirt_loading.png',
      skateboard: '/assets/placeholders/deck_loading.png',
      headwear: '/assets/placeholders/hat_loading.png'
    };
    return placeholders[category] || '/assets/placeholders/generic_loading.png';
  }

  getCategoryHeaderStyle(categoryName) {
    if (categoryName.includes('Legendary')) {
      return {
        background: 'linear-gradient(45deg, #FFD700, #FFA500)',
        color: '#000000',
        textShadow: 'none'
      };
    }
    if (categoryName.includes('Ultra Rare')) {
      return {
        background: 'linear-gradient(45deg, #5856D6, #3730A3)',
        color: '#FFFFFF',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)'
      };
    }
    return {
      background: 'linear-gradient(45deg, #007AFF, #0051D0)',
      color: '#FFFFFF',
      textShadow: '0 2px 4px rgba(0,0,0,0.5)'
    };
  }

  buildStatsDisplay(stats) {
    return {
      layout: 'horizontal',
      items: [
        {
          label: 'Total Items',
          value: stats.totalItems,
          icon: '📦'
        },
        {
          label: 'Total Quantity',
          value: stats.totalQuantity.toLocaleString(),
          icon: '🔢'
        },
        {
          label: 'Average Price',
          value: this.formatPrice(stats.averagePrice),
          icon: '💰'
        },
        {
          label: 'Time Remaining',
          value: stats.timeRemaining.displayText,
          icon: '⏰',
          countdown: true
        }
      ]
    };
  }

  // CLEANUP

  cleanup() {
    this.liveStockWatchers.forEach(unsubscribe => unsubscribe());
    this.animationTimers.forEach(timer => clearTimeout(timer));
    this.liveStockWatchers.clear();
    this.animationTimers.clear();
    this.hypeEffects.clear();
  }
}

export default new RareDropUIService();
