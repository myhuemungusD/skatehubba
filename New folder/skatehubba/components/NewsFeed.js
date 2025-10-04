import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import moment from "moment";

export default function NewsFeed() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Enhanced mock news data - replace with real API call
  const mockNews = [
    { 
      id: "1", 
      headline: "Legendary Gear Drop: Osiris D3 Now Live!", 
      time: new Date(),
      category: "gear",
      icon: "shopping-bag",
      priority: "high"
    },
    { 
      id: "2", 
      headline: "SkateHubba Crew Battle Kicks Off This Weekend", 
      time: new Date(Date.now() - 1000 * 60 * 15),
      category: "event",
      icon: "users",
      priority: "medium"
    },
    { 
      id: "3", 
      headline: "New Shop Partnership: Powell-Peralta", 
      time: new Date(Date.now() - 1000 * 60 * 60 * 2),
      category: "partnership",
      icon: "handshake",
      priority: "medium"
    },
    { 
      id: "4", 
      headline: "Street League Championship Finals Live Stream", 
      time: new Date(Date.now() - 1000 * 60 * 60 * 6),
      category: "competition",
      icon: "trophy",
      priority: "high"
    },
    { 
      id: "5", 
      headline: "Tony Hawk Joins SkateHubba as Ambassador", 
      time: new Date(Date.now() - 1000 * 60 * 60 * 12),
      category: "announcement",
      icon: "star",
      priority: "high"
    }
  ];

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    try {
      setLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setNews(mockNews);
    } catch (error) {
      console.error('Failed to load news:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNews();
    setRefreshing(false);
  };

  const getCategoryColor = (category) => {
    const colors = {
      gear: "#FF6B35",
      event: "#4ECDC4",
      partnership: "#45B7B8",
      competition: "#FFA07A",
      announcement: "#FFD600"
    };
    return colors[category] || "#FFD600";
  };

  const getPriorityIndicator = (priority) => {
    if (priority === "high") return "🔥";
    if (priority === "medium") return "⭐";
    return "";
  };

  const renderNewsItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.item, { borderLeftColor: getCategoryColor(item.category) }]}
      activeOpacity={0.8}
    >
      <View style={styles.itemHeader}>
        <View style={styles.iconContainer}>
          <FontAwesome5 
            name={item.icon} 
            size={16} 
            color={getCategoryColor(item.category)} 
          />
        </View>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            {getPriorityIndicator(item.priority)} {item.headline}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.time}>{moment(item.time).fromNow()}</Text>
            <Text style={[styles.category, { color: getCategoryColor(item.category) }]}>
              {item.category.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Skate News</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD600" />
          <Text style={styles.loadingText}>Loading latest news...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>🗞️ Skate News</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <FontAwesome5 name="sync" size={16} color="#FFD600" />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={news}
        keyExtractor={item => item.id}
        renderItem={renderNewsItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No news available</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.retryBtn}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    paddingBottom: 2
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  heading: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 19
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#23262b"
  },
  item: {
    backgroundColor: "#242a2f",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#FFD600",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderLeftWidth: 4
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1a1d22",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  titleContainer: {
    flex: 1
  },
  title: {
    fontWeight: "bold",
    color: "#FFF",
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 6
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  time: {
    fontSize: 12,
    color: "#AAA",
    fontWeight: "500"
  },
  category: {
    fontSize: 10,
    fontWeight: "bold",
    backgroundColor: "rgba(255, 214, 0, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  separator: {
    height: 10
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40
  },
  loadingText: {
    color: "#AAA",
    fontSize: 14,
    marginTop: 12
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40
  },
  emptyText: {
    color: "#AAA",
    fontSize: 16,
    marginBottom: 12
  },
  retryBtn: {
    backgroundColor: "#FFD600",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  retryText: {
    color: "#23262b",
    fontWeight: "bold"
  }
});
