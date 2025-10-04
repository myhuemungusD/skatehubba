import React, { useEffect, useState, useRef } from "react";
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import moment from "moment";

// Demo/mock messages; replace with backend data
const mockMessages = [
  {
    id: "m1",
    user: { avatar: "https://i.pravatar.cc/100?img=13", name: "FlipTayto", level: 12 },
    text: "Who's at Redlands today?",
    time: new Date(Date.now() - 1000 * 60 * 3),
    type: "text",
    reactions: { "🔥": 2, "🛹": 1 }
  },
  {
    id: "m2",
    user: { avatar: "https://i.pravatar.cc/100?img=6", name: "MuskaDrip", level: 8 },
    text: "Gear drop is 🔥🔥🔥",
    time: new Date(Date.now() - 1000 * 60 * 2),
    type: "text",
    reactions: { "💯": 3 }
  },
  {
    id: "m3",
    user: { avatar: "https://i.pravatar.cc/100?img=11", name: "NollieQueen", level: 15 },
    text: "Spectating the session now!",
    time: new Date(Date.now() - 1000 * 60 * 1),
    type: "session",
    reactions: {}
  },
  {
    id: "m4",
    user: { avatar: "https://i.pravatar.cc/100?img=7", name: "KickflipKing", level: 20 },
    text: "Just landed a tre flip down the 9 stair! 🛹💥",
    time: new Date(Date.now() - 1000 * 60 * 5),
    type: "trick",
    reactions: { "🔥": 5, "🛹": 3, "💯": 2 }
  },
  {
    id: "m5",
    user: { avatar: "https://i.pravatar.cc/100?img=4", name: "SkateGuru", level: 25 },
    text: "⚔️ Challenge sent to @FlipTayto - Game of SKATE!",
    time: new Date(Date.now() - 1000 * 60 * 7),
    type: "challenge",
    reactions: { "⚔️": 1 }
  }
];

export default function ChatMessageList({ 
  messages = mockMessages, 
  onReaction = null,
  onUserPress = null,
  loading = false 
}) {
  const flatListRef = useRef(null);
  const [reactionMenuVisible, setReactionMenuVisible] = useState(null);

  // Scroll to bottom when new messages come in
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const getMessageTypeStyle = (type) => {
    switch (type) {
      case 'challenge':
        return { borderLeftWidth: 3, borderLeftColor: '#FFD600' };
      case 'trick':
        return { borderLeftWidth: 3, borderLeftColor: '#FF6B9D' };
      case 'session':
        return { borderLeftWidth: 3, borderLeftColor: '#4ECDC4' };
      default:
        return {};
    }
  };

  const getMessageTypeIcon = (type) => {
    switch (type) {
      case 'challenge': return '⚔️';
      case 'trick': return '🛹';
      case 'session': return '📍';
      default: return null;
    }
  };

  const handleReaction = (messageId, emoji) => {
    if (onReaction) {
      onReaction(messageId, emoji);
    }
    setReactionMenuVisible(null);
  };

  const handleUserPress = (user) => {
    if (onUserPress) {
      onUserPress(user);
    }
  };

  const renderReactions = (reactions) => {
    if (!reactions || Object.keys(reactions).length === 0) return null;
    
    return (
      <View style={styles.reactionsContainer}>
        {Object.entries(reactions).map(([emoji, count]) => (
          <View key={emoji} style={styles.reactionBubble}>
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            <Text style={styles.reactionCount}>{count}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderQuickReactions = (messageId) => {
    const quickEmojis = ['🔥', '🛹', '💯', '😂', '👏'];
    
    return (
      <View style={styles.quickReactions}>
        {quickEmojis.map(emoji => (
          <TouchableOpacity
            key={emoji}
            style={styles.quickReactionBtn}
            onPress={() => handleReaction(messageId, emoji)}
          >
            <Text style={styles.quickReactionEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderMessage = ({ item }) => (
    <View style={styles.msgRow}>
      <TouchableOpacity onPress={() => handleUserPress(item.user)}>
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
      </TouchableOpacity>
      
      <View style={styles.messageContainer}>
        <View style={[styles.bubble, getMessageTypeStyle(item.type)]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => handleUserPress(item.user)}>
              <Text style={styles.name}>{item.user.name}</Text>
            </TouchableOpacity>
            {item.user.level && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>{item.user.level}</Text>
              </View>
            )}
            <Text style={styles.time}>{moment(item.time).fromNow()}</Text>
            {getMessageTypeIcon(item.type) && (
              <Text style={styles.typeIcon}>{getMessageTypeIcon(item.type)}</Text>
            )}
          </View>
          
          <Text style={styles.text}>{item.text}</Text>
          
          {renderReactions(item.reactions)}
        </View>
        
        <View style={styles.messageActions}>
          <TouchableOpacity
            style={styles.reactionBtn}
            onPress={() => setReactionMenuVisible(
              reactionMenuVisible === item.id ? null : item.id
            )}
          >
            <FontAwesome5 name="heart" size={12} color="#666" />
          </TouchableOpacity>
        </View>
        
        {reactionMenuVisible === item.id && renderQuickReactions(item.id)}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD600" />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <FontAwesome5 name="comments" size={48} color="#444" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start the conversation! 🛹</Text>
          </View>
        )}
        onLayout={() => {
          // Auto-scroll to bottom on initial load
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 100);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#181b1e",
    paddingHorizontal: 8
  },
  contentContainer: {
    paddingBottom: 80, // Space for ChatBar
    paddingTop: 12
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    marginTop: 4,
    backgroundColor: "#ddd",
    borderWidth: 2,
    borderColor: "#FFD600"
  },
  messageContainer: {
    flex: 1,
    maxWidth: "85%"
  },
  bubble: {
    backgroundColor: "#23262b",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#FFD600",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4
  },
  name: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 14,
    marginRight: 8
  },
  levelBadge: {
    backgroundColor: "#FFD600",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 8
  },
  levelText: {
    color: "#23262b",
    fontSize: 10,
    fontWeight: "bold"
  },
  time: {
    color: "#AAA",
    fontSize: 11,
    flex: 1
  },
  typeIcon: {
    fontSize: 12,
    marginLeft: 4
  },
  text: {
    color: "#FFF",
    fontSize: 15,
    lineHeight: 20
  },
  reactionsContainer: {
    flexDirection: "row",
    marginTop: 8,
    flexWrap: "wrap"
  },
  reactionBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1d22",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4
  },
  reactionEmoji: {
    fontSize: 12,
    marginRight: 4
  },
  reactionCount: {
    color: "#FFD600",
    fontSize: 11,
    fontWeight: "bold"
  },
  messageActions: {
    flexDirection: "row",
    marginTop: 4,
    marginLeft: 8
  },
  reactionBtn: {
    padding: 4,
    borderRadius: 8
  },
  quickReactions: {
    flexDirection: "row",
    backgroundColor: "#2a2d33",
    borderRadius: 16,
    padding: 8,
    marginTop: 4,
    marginLeft: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5
  },
  quickReactionBtn: {
    padding: 4,
    marginRight: 8
  },
  quickReactionEmoji: {
    fontSize: 16
  },
  separator: {
    height: 2
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#181b1e"
  },
  loadingText: {
    color: "#FFD600",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 12
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100
  },
  emptyText: {
    color: "#FFD600",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8
  },
  emptySubtext: {
    color: "#AAA",
    fontSize: 14,
    textAlign: "center"
  }
});
