# 💬 ChatBar Integration Guide

## 🚀 Quick Setup

### 1. Import ChatBar
```javascript
import ChatBar from '../components/ChatBar';
import { sendChatAPI } from '../services/chatService';
```

### 2. Add to Your Screen
```javascript
// Simple usage
<ChatBar onSend={msg => sendChatAPI(msg)} />

// With custom handler
<ChatBar onSend={handleSendMessage} />
```

### 3. Custom Send Handler
```javascript
const handleSendMessage = async (message) => {
  try {
    await sendChatAPI(message);
    console.log('Message sent:', message);
  } catch (error) {
    console.error('Failed to send:', error);
    // Handle error (show toast, etc.)
  }
};
```

## 🎯 Features

### ✅ **Enhanced ChatBar Features**
- **Smart Send**: Only sends non-empty messages
- **Keyboard Handling**: Proper iOS/Android keyboard behavior
- **Return Key**: Press enter to send
- **Character Limit**: 500 character max
- **Auto Clear**: Clears input after sending
- **Styled Send Button**: Beautiful gold-themed design

### ✅ **Chat Service Features**
- **Real-time Messaging**: Live message updates
- **Message Types**: Text, challenge, session, trick messages
- **Reactions**: Emoji reactions to messages
- **Chat History**: Load previous messages
- **Room Support**: Different chat rooms
- **User Info**: Automatic user data attachment

## 🛠 Integration Examples

### Example 1: Simple Chat in LiveSeshScreen
```javascript
import ChatBar from '../components/ChatBar';
import { sendChatAPI } from '../services/chatService';

export default function LiveSeshScreen() {
  return (
    <View style={styles.container}>
      {/* Your existing content */}
      <Text>Live Session Content</Text>
      
      {/* Add ChatBar at bottom */}
      <ChatBar onSend={msg => sendChatAPI(msg)} />
    </View>
  );
}
```

### Example 2: Chat with Real-time Messages
```javascript
import React, { useState, useEffect } from 'react';
import ChatBar from '../components/ChatBar';
import { chatService, sendChatAPI } from '../services/chatService';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Listen to real-time messages
    const unsubscribe = chatService.listenToMessages('global', setMessages);
    return () => unsubscribe(); // Cleanup
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.messages}>
        {messages.map(msg => (
          <Text key={msg.id} style={styles.message}>
            {msg.username}: {msg.text}
          </Text>
        ))}
      </ScrollView>
      
      <ChatBar onSend={msg => sendChatAPI(msg)} />
    </View>
  );
}
```

### Example 3: Different Message Types
```javascript
import { chatService } from '../services/chatService';

// Send different types of messages
const sendChallenge = async (challengeData) => {
  await chatService.sendChallengeMessage(challengeData);
};

const sendTrick = async (trickName) => {
  await chatService.sendTrickMessage(trickName, 'hard');
};

const sendSessionJoin = async (sessionName, location) => {
  await chatService.sendSessionJoinMessage(sessionName, location);
};
```

## 🔥 Advanced Usage

### Custom Chat Room
```javascript
// Listen to specific room
useEffect(() => {
  const unsubscribe = chatService.listenToMessages(
    'session_123', // specific room
    setMessages,
    100 // message limit
  );
  return () => unsubscribe();
}, []);

// Send to specific room
const sendToRoom = async (message, roomId) => {
  await chatService.sendMessage(message, roomId);
};
```

### Message Reactions
```javascript
const handleReaction = async (messageId, emoji) => {
  await chatService.reactToMessage(messageId, emoji);
};

// In your message component
<TouchableOpacity onPress={() => handleReaction(msg.id, '🔥')}>
  <Text>🔥</Text>
</TouchableOpacity>
```

### Chat History
```javascript
const loadHistory = async () => {
  const history = await chatService.getChatHistory('global', 50);
  setMessages(history);
};
```

## 📱 UI Integration Tips

### 1. **Positioning**
ChatBar uses `position: absolute` and `bottom: 0` to stay at screen bottom.

### 2. **Keyboard Avoidance**
Built-in `KeyboardAvoidingView` handles keyboard properly.

### 3. **Content Padding**
Add bottom padding to your content to avoid ChatBar overlap:
```javascript
const styles = StyleSheet.create({
  content: {
    paddingBottom: 80 // Space for ChatBar
  }
});
```

### 4. **Z-Index**
ChatBar has `zIndex: 100` to stay on top.

## 🎨 Styling

The ChatBar uses your app's theme:
- **Background**: `#222` (dark)
- **Input**: `#242a2f` (darker)
- **Send Button**: `#23262b` with `#FFD600` icon
- **Border**: `#333` top border

### Customization
```javascript
// Override styles by passing custom styles
<ChatBar 
  onSend={sendChatAPI}
  style={customStyles}
/>
```

## 🚨 Important Notes

1. **Firebase Auth**: User must be logged in to send messages
2. **Error Handling**: Implement try/catch for message sending
3. **Cleanup**: Always unsubscribe from listeners
4. **Performance**: Limit message history to avoid memory issues
5. **Validation**: Messages are trimmed and validated before sending

## 🔧 Troubleshooting

### Issue: Messages not sending
- Check Firebase auth status
- Verify network connection
- Check console for errors

### Issue: Keyboard covering input
- Ensure `KeyboardAvoidingView` is properly configured
- Adjust `behavior` prop for different platforms

### Issue: Real-time not working
- Check Firestore security rules
- Verify listener is properly set up
- Check for unsubscribe on component unmount

Ready to chat! 🛹💬
