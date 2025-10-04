// Example: Complete Chat Implementation with ChatBar
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Image, 
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform 
} from 'react-native';
import ChatBar from '../components/ChatBar';
import { chatService, sendChatAPI } from '../services/chatService';
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen({ roomId = 'global' }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    // Start listening to messages
    const unsubscribe = chatService.listenToMessages(
      roomId,
      (newMessages) => {
        setMessages(newMessages);
        setLoading(false);
        // Auto scroll to bottom
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [roomId]);

  const handleSendMessage = async (message) => {
    try {
      await sendChatAPI(message);
      // Message will be added via the real-time listener
    } catch (error) {
      console.error('Failed to send message:', error);
      // You could show an error toast here
    }
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      await chatService.reactToMessage(messageId, emoji);
    } catch (error) {
      console.error('Failed to react to message:', error);
    }
  };

  const renderMessage = (message, index) => {
    const isLastMessage = index === messages.length - 1;
    const showAvatar = isLastMessage || messages[index + 1]?.userId !== message.userId;
    
    return (
      <View key={message.id} style={styles.messageContainer}>
        <View style={styles.messageRow}>
          {showAvatar ? (
            <Image source={{ uri: message.userAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder} />
          )}
          
          <View style={styles.messageContent}>
            {showAvatar && (
              <Text style={styles.username}>{message.username}</Text>
            )}
            
            <View style={[styles.messageBubble, getMessageTypeStyle(message.type)]}>
              <Text style={styles.messageText}>{message.text}</Text>
              {message.type !== 'text' && (
                <Text style={styles.messageType}>
                  {getMessageTypeIcon(message.type)}
                </Text>
              )}
            </View>
            
            {/* Reactions */}
            {message.reactions && Object.keys(message.reactions).length > 0 && (
              <View style={styles.reactions}>
                {Object.entries(message.reactions).map(([userId, emoji]) => (
                  <Text key={userId} style={styles.reaction}>{emoji}</Text>
                ))}
              </View>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.reactionBtn}
            onPress={() => handleReaction(message.id, '🔥')}
          >
            <Ionicons name="heart-outline" size={16} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const getMessageTypeStyle = (type) => {
    switch (type) {
      case 'challenge':
        return { backgroundColor: '#FFD600', borderLeftWidth: 4, borderLeftColor: '#FF6B35' };
      case 'session':
        return { backgroundColor: '#4ECDC4', borderLeftWidth: 4, borderLeftColor: '#45B7B8' };
      case 'trick':
        return { backgroundColor: '#FF6B9D', borderLeftWidth: 4, borderLeftColor: '#E71C58' };
      default:
        return {};
    }
  };

  const getMessageTypeIcon = (type) => {
    switch (type) {
      case 'challenge': return '⚔️';
      case 'session': return '📍';
      case 'trick': return '🛹';
      default: return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet...</Text>
            <Text style={styles.emptySubtext}>Be the first to start the conversation! 🛹</Text>
          </View>
        ) : (
          messages.map((message, index) => renderMessage(message, index))
        )}
      </ScrollView>
      
      {/* Chat Input Bar */}
      <ChatBar onSend={handleSendMessage} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#23262b'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#23262b'
  },
  loadingText: {
    color: '#FFD600',
    fontSize: 18,
    fontWeight: 'bold'
  },
  messagesContainer: {
    flex: 1,
    paddingBottom: 80 // Space for ChatBar
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  messageContainer: {
    marginVertical: 4
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#FFD600'
  },
  avatarPlaceholder: {
    width: 32,
    marginRight: 8
  },
  messageContent: {
    flex: 1,
    marginRight: 8
  },
  username: {
    color: '#FFD600',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
    marginLeft: 4
  },
  messageBubble: {
    backgroundColor: '#1a1d22',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '85%'
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 20
  },
  messageType: {
    fontSize: 12,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  reactions: {
    flexDirection: 'row',
    marginTop: 4,
    marginLeft: 4
  },
  reaction: {
    fontSize: 14,
    marginRight: 4,
    backgroundColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  reactionBtn: {
    padding: 4
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100
  },
  emptyText: {
    color: '#FFD600',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8
  },
  emptySubtext: {
    color: '#AAA',
    fontSize: 14,
    textAlign: 'center'
  }
});
