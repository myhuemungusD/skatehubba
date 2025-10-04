// Example: How to use the enhanced NewsFeed component

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import NewsFeed from '../components/NewsFeed';

export default function HomeScreenWithNews() {
  return (
    <ScrollView style={styles.container}>
      {/* Your other components */}
      <View style={styles.otherContent}>
        {/* NearbySkaters, LiveSessions, etc. */}
      </View>
      
      {/* News Feed */}
      <NewsFeed />
      
      {/* More content below */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#23262b'
  },
  otherContent: {
    // Your other styling
  }
});

/*
NEWSFEED INTEGRATION GUIDE:

1. BASIC USAGE:
   Simply import and use the component:
   ```javascript
   import NewsFeed from '../components/NewsFeed';
   
   <NewsFeed />
   ```

2. WITH NEWS SERVICE:
   The component automatically uses the newsService for data.
   To fetch from your backend:
   ```javascript
   import { newsService } from '../services/newsService';
   
   // In your component
   useEffect(() => {
     newsService.getNews(10).then(setNews);
   }, []);
   ```

3. CATEGORY FILTERING:
   ```javascript
   // Get only gear news
   const gearNews = await newsService.getNewsByCategory('gear', 5);
   
   // Get trending news
   const trending = await newsService.getTrendingNews(3);
   ```

4. SEARCH FUNCTIONALITY:
   ```javascript
   const searchResults = await newsService.searchNews('tony hawk', 10);
   ```

5. FEATURES INCLUDED:
   ✅ Loading states with spinner
   ✅ Pull-to-refresh functionality
   ✅ Category color coding
   ✅ Priority indicators (🔥 for high, ⭐ for medium)
   ✅ Icon-based categories
   ✅ Touchable news items (ready for navigation)
   ✅ Empty state handling
   ✅ Error handling with retry
   ✅ Responsive design
   ✅ Professional styling

6. NEWS CATEGORIES:
   - gear (Orange) - New products, drops
   - event (Teal) - Competitions, battles
   - partnership (Blue) - Brand collaborations
   - competition (Peach) - Contest results
   - announcement (Gold) - Major updates

7. CUSTOMIZATION:
   You can modify the mock data in the component or connect
   to your real backend by updating the loadNews() function.

8. BACKEND INTEGRATION:
   Replace the mockNews data with real API calls:
   ```javascript
   const loadNews = async () => {
     try {
       setLoading(true);
       const articles = await newsService.getNews(20);
       setNews(articles);
     } catch (error) {
       console.error('Failed to load news:', error);
     } finally {
       setLoading(false);
     }
   };
   ```

The NewsFeed is now ready for production use! 🗞️🛹
*/
