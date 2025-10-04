# 🗞️ NewsFeed Component Guide

## 🚀 Overview

The NewsFeed component provides a comprehensive news display system for your skateboarding app, featuring categorized articles, priority indicators, and interactive elements.

## ✨ Features

### 🎨 **Visual Features**
- **Category Color Coding**: Different colors for gear, events, partnerships, etc.
- **Priority Indicators**: 🔥 for high priority, ⭐ for medium priority
- **Icon System**: FontAwesome5 icons for each category
- **Professional Styling**: Cards with shadows, borders, and proper spacing
- **Loading States**: Spinner and loading text while fetching

### 🔄 **Interactive Features**
- **Pull-to-Refresh**: Swipe down to refresh news
- **Touchable Items**: Tap news items (ready for navigation)
- **Refresh Button**: Manual refresh button in header
- **Empty State**: Friendly message when no news available
- **Error Handling**: Retry mechanism for failed loads

### 📱 **Technical Features**
- **Real-time Updates**: Ready for live news feeds
- **Caching**: Built-in news caching for performance
- **Search**: Full-text search across articles
- **Categories**: Filter by news category
- **Trending**: Most popular articles

## 🎯 Usage

### Basic Implementation
```javascript
import NewsFeed from '../components/NewsFeed';

// Simple usage
<NewsFeed />
```

### With Custom Styling
```javascript
<View style={styles.newsContainer}>
  <NewsFeed />
</View>
```

### In ScrollView
```javascript
<ScrollView>
  {/* Other components */}
  <NewsFeed />
  {/* More content */}
</ScrollView>
```

## 📊 News Data Structure

Each news article has this structure:
```javascript
{
  id: "unique_id",
  headline: "Article title",
  content: "Full article content",
  time: Date object,
  publishedAt: Date object,
  category: "gear|event|partnership|competition|announcement",
  icon: "fontawesome-icon-name",
  priority: "high|medium|low",
  author: "Author name",
  imageUrl: "Image URL",
  tags: ["tag1", "tag2"],
  views: 0,
  likes: 0
}
```

## 🎨 Categories & Colors

| Category | Color | Icon | Use Case |
|----------|-------|------|----------|
| gear | `#FF6B35` | shopping-bag | Product drops, gear releases |
| event | `#4ECDC4` | users | Competitions, battles, meetups |
| partnership | `#45B7B8` | handshake | Brand collaborations |
| competition | `#FFA07A` | trophy | Contest results, rankings |
| announcement | `#FFD600` | star | Major updates, features |

## 🔧 Backend Integration

### Using News Service
```javascript
import { newsService } from '../services/newsService';

// Get latest news
const articles = await newsService.getNews(20);

// Get by category
const gearNews = await newsService.getNewsByCategory('gear', 10);

// Search articles
const results = await newsService.searchNews('tony hawk');

// Get trending
const trending = await newsService.getTrendingNews(5);
```

### Custom Data Loading
```javascript
// In your NewsFeed component
const loadNews = async () => {
  try {
    setLoading(true);
    // Replace with your API call
    const response = await fetch('/api/news');
    const articles = await response.json();
    setNews(articles);
  } catch (error) {
    console.error('Failed to load news:', error);
  } finally {
    setLoading(false);
  }
};
```

## 🎛 Customization

### Modify Categories
```javascript
// Add new category in getCategoryColor function
const getCategoryColor = (category) => {
  const colors = {
    gear: "#FF6B35",
    event: "#4ECDC4",
    // Add your custom category
    tutorial: "#9B59B6"
  };
  return colors[category] || "#FFD600";
};
```

### Custom Priority Indicators
```javascript
const getPriorityIndicator = (priority) => {
  if (priority === "urgent") return "🚨";
  if (priority === "high") return "🔥";
  if (priority === "medium") return "⭐";
  return "";
};
```

### Styling Override
```javascript
// Override specific styles
const customStyles = StyleSheet.create({
  item: {
    backgroundColor: "#yourColor",
    borderRadius: 15,
    // ... your custom styles
  }
});
```

## 📱 Navigation Integration

### Navigate to Article Detail
```javascript
const renderNewsItem = ({ item }) => (
  <TouchableOpacity 
    style={styles.item}
    onPress={() => navigation.navigate('ArticleDetail', { article: item })}
  >
    {/* Article content */}
  </TouchableOpacity>
);
```

### Category Pages
```javascript
const navigateToCategory = (category) => {
  navigation.navigate('CategoryNews', { category });
};
```

## 🔍 Search Integration

### Add Search Bar
```javascript
const [searchTerm, setSearchTerm] = useState('');

const handleSearch = async (term) => {
  if (term.trim()) {
    const results = await newsService.searchNews(term);
    setNews(results);
  } else {
    loadNews(); // Reset to all news
  }
};

// In your JSX
<SearchBar
  placeholder="Search news..."
  onChangeText={setSearchTerm}
  onSubmitEditing={() => handleSearch(searchTerm)}
/>
<NewsFeed />
```

## 🎯 Performance Tips

1. **Limit Articles**: Don't load too many articles at once
2. **Caching**: Use the built-in newsService caching
3. **Pagination**: Implement load-more functionality
4. **Image Optimization**: Optimize news images for mobile
5. **Memory Management**: Clear old articles when loading new ones

## 🚀 Ready for Production

The NewsFeed component is production-ready with:
- ✅ Error handling
- ✅ Loading states
- ✅ Pull-to-refresh
- ✅ Responsive design
- ✅ Professional styling
- ✅ Backend integration ready
- ✅ Search functionality
- ✅ Category system
- ✅ Performance optimized

Perfect for keeping your skate community informed! 🛹📰
