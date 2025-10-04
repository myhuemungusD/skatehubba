// News Service for SkateHubba
import { db } from './firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  where,
  serverTimestamp
} from 'firebase/firestore';

class NewsService {
  constructor() {
    this.newsCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Fetch latest news articles
   * @param {number} articleLimit - Number of articles to fetch
   * @param {string} category - Filter by category (optional)
   */
  async getNews(articleLimit = 20, category = null) {
    try {
      const cacheKey = `news_${articleLimit}_${category || 'all'}`;
      
      // Check cache first
      if (this.newsCache.has(cacheKey)) {
        const cached = this.newsCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.data;
        }
      }

      // Build query
      let newsQuery = query(
        collection(db, 'news'),
        orderBy('publishedAt', 'desc'),
        limit(articleLimit)
      );

      // Add category filter if specified
      if (category) {
        newsQuery = query(
          collection(db, 'news'),
          where('category', '==', category),
          orderBy('publishedAt', 'desc'),
          limit(articleLimit)
        );
      }

      const snapshot = await getDocs(newsQuery);
      const articles = [];

      snapshot.forEach((doc) => {
        articles.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Cache the results
      this.newsCache.set(cacheKey, {
        data: articles,
        timestamp: Date.now()
      });

      return articles;

    } catch (error) {
      console.error('Failed to fetch news:', error);
      
      // Return mock data as fallback
      return this.getMockNews();
    }
  }

  /**
   * Get mock news data for development/fallback
   */
  getMockNews() {
    return [
      { 
        id: "1", 
        headline: "Legendary Gear Drop: Osiris D3 Now Live!", 
        content: "The iconic Osiris D3 shoes are back! Available exclusively through SkateHubba shop partners.",
        time: new Date(),
        publishedAt: new Date(),
        category: "gear",
        icon: "shopping-bag",
        priority: "high",
        author: "SkateHubba Team",
        imageUrl: "https://example.com/osiris-d3.jpg",
        tags: ["gear", "shoes", "osiris", "drop"]
      },
      { 
        id: "2", 
        headline: "SkateHubba Crew Battle Kicks Off This Weekend", 
        content: "Join the biggest crew battle of the year! Registration closes Friday at midnight.",
        time: new Date(Date.now() - 1000 * 60 * 15),
        publishedAt: new Date(Date.now() - 1000 * 60 * 15),
        category: "event",
        icon: "users",
        priority: "medium",
        author: "Event Team",
        imageUrl: "https://example.com/crew-battle.jpg",
        tags: ["competition", "crew", "battle", "weekend"]
      },
      { 
        id: "3", 
        headline: "New Shop Partnership: Powell-Peralta", 
        content: "We're stoked to announce our partnership with legendary brand Powell-Peralta!",
        time: new Date(Date.now() - 1000 * 60 * 60 * 2),
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        category: "partnership",
        icon: "handshake",
        priority: "medium",
        author: "Business Team",
        imageUrl: "https://example.com/powell-peralta.jpg",
        tags: ["partnership", "powell-peralta", "brand", "collaboration"]
      },
      { 
        id: "4", 
        headline: "Street League Championship Finals Live Stream", 
        content: "Watch the best street skaters compete live! Stream starts at 2PM PST.",
        time: new Date(Date.now() - 1000 * 60 * 60 * 6),
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
        category: "competition",
        icon: "trophy",
        priority: "high",
        author: "Media Team",
        imageUrl: "https://example.com/street-league.jpg",
        tags: ["competition", "street-league", "live-stream", "finals"]
      },
      { 
        id: "5", 
        headline: "Tony Hawk Joins SkateHubba as Ambassador", 
        content: "The legend himself joins our ambassador program! Get ready for exclusive content and challenges.",
        time: new Date(Date.now() - 1000 * 60 * 60 * 12),
        publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
        category: "announcement",
        icon: "star",
        priority: "high",
        author: "SkateHubba Team",
        imageUrl: "https://example.com/tony-hawk.jpg",
        tags: ["tony-hawk", "ambassador", "legend", "exclusive"]
      }
    ];
  }

  /**
   * Get news by category
   * @param {string} category - News category
   * @param {number} limit - Number of articles
   */
  async getNewsByCategory(category, limit = 10) {
    return await this.getNews(limit, category);
  }

  /**
   * Create a new news article (admin function)
   * @param {Object} articleData - Article data
   */
  async createNewsArticle(articleData) {
    try {
      const article = {
        ...articleData,
        publishedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        views: 0,
        likes: 0,
        status: 'published'
      };

      const docRef = await addDoc(collection(db, 'news'), article);
      
      // Clear cache
      this.newsCache.clear();
      
      return { success: true, articleId: docRef.id };
    } catch (error) {
      console.error('Failed to create news article:', error);
      throw error;
    }
  }

  /**
   * Update article view count
   * @param {string} articleId - Article ID
   */
  async incrementViews(articleId) {
    try {
      const articleRef = doc(db, 'news', articleId);
      await updateDoc(articleRef, {
        views: increment(1)
      });
    } catch (error) {
      console.warn('Failed to increment views:', error);
    }
  }

  /**
   * Like/unlike an article
   * @param {string} articleId - Article ID
   * @param {boolean} liked - Whether to like or unlike
   */
  async toggleLike(articleId, liked) {
    try {
      const articleRef = doc(db, 'news', articleId);
      await updateDoc(articleRef, {
        likes: increment(liked ? 1 : -1)
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to toggle like:', error);
      throw error;
    }
  }

  /**
   * Search news articles
   * @param {string} searchTerm - Search term
   * @param {number} limit - Result limit
   */
  async searchNews(searchTerm, limit = 10) {
    try {
      // In a real implementation, you'd use a proper search service
      // For now, we'll filter mock data
      const allNews = this.getMockNews();
      
      const filtered = allNews.filter(article => 
        article.headline.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      ).slice(0, limit);

      return filtered;
    } catch (error) {
      console.error('Failed to search news:', error);
      return [];
    }
  }

  /**
   * Get trending news (most viewed/liked recently)
   * @param {number} limit - Number of articles
   */
  async getTrendingNews(limit = 5) {
    try {
      // In production, you'd query by views/likes in last 24-48 hours
      const newsQuery = query(
        collection(db, 'news'),
        orderBy('views', 'desc'),
        orderBy('publishedAt', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(newsQuery);
      const articles = [];

      snapshot.forEach((doc) => {
        articles.push({
          id: doc.id,
          ...doc.data(),
          trending: true
        });
      });

      return articles.length > 0 ? articles : this.getMockNews().slice(0, limit);
    } catch (error) {
      console.error('Failed to get trending news:', error);
      return this.getMockNews().slice(0, limit);
    }
  }

  /**
   * Clear news cache
   */
  clearCache() {
    this.newsCache.clear();
  }
}

// Export singleton instance
export const newsService = new NewsService();
export default newsService;
