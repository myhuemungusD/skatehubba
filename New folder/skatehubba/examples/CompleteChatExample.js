// Example: Complete Chat Implementation with ChatMessageList + ChatBar
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import ChatMessageList from '../components/ChatMessageList';
import ChatBar from '../components/ChatBar';
import { chatService } from '../services/chatService';

export default function CompleteChatScreen({ roomId = 'global' }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Start listening to real-time messages
    const unsubscribe = chatService.listenToMessages(
      roomId,
      (newMessages) => {
        setMessages(newMessages);
        setLoading(false);
      },
      50 // Load last 50 messages
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [roomId]);

  const handleSendMessage = async (message) => {
    try {
      await chatService.sendMessage(message, roomId);
      // Message will be added automatically via real-time listener
    } catch (error) {
      console.error('Failed to send message:', error);
      // Could show an error toast here
    }
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      await chatService.reactToMessage(messageId, emoji);
      // Reaction will be updated via real-time listener
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleUserPress = (user) => {
    // Navigate to user profile or show user menu
    console.log('User pressed:', user);
    // navigation.navigate('Profile', { userId: user.id });
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ChatMessageList
        messages={messages}
        loading={loading}
        onReaction={handleReaction}
        onUserPress={handleUserPress}
      />
      
      <ChatBar onSend={handleSendMessage} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181b1e'
  }
});

/*
CHAT INTEGRATION PATTERNS:

1. SIMPLE USAGE:
   ```javascript
   import ChatMessageList from '../components/ChatMessageList';
   
   <ChatMessageList messages={messagesArray} />
   ```

2. WITH REACTIONS:
   ```javascript
   const handleReaction = async (messageId, emoji) => {
     await chatService.reactToMessage(messageId, emoji);
   };
   
   <ChatMessageList 
     messages={messages}
     onReaction={handleReaction}
   />
   ```

3. WITH USER INTERACTION:
   ```javascript
   const handleUserPress = (user) => {
     navigation.navigate('Profile', { userId: user.id });
   };
   
   <ChatMessageList 
     messages={messages}
     onUserPress={handleUserPress}
   />
   ```

4. LIVE CHAT ROOM:
   ```javascript
   useEffect(() => {
     const unsubscribe = chatService.listenToMessages('session_123', setMessages);
     return () => unsubscribe();
   }, []);
   
   <ChatMessageList messages={messages} />
   <ChatBar onSend={msg => chatService.sendMessage(msg, 'session_123')} />
   ```

5. MESSAGE TYPES:
   - text: Regular chat message
   - challenge: Challenge notifications
   - trick: Trick completion messages  
   - session: Session join/leave messages

6. FEATURES INCLUDED:
   ✅ Auto-scroll to bottom on new messages
   ✅ Message reactions with quick emoji picker
   ✅ User level badges
   ✅ Message type indicators (colored borders)
   ✅ Clickable user avatars and names
   ✅ Loading states
   ✅ Empty state handling
   ✅ Responsive design
   ✅ Professional styling
*/
