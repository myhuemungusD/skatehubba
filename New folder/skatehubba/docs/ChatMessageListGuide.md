# 💬 ChatMessageList Integration Guide

## 🚀 Overview

The ChatMessageList component provides a comprehensive chat message display system with reactions, user interactions, and message type indicators for your skateboarding app.

## ✨ Features

### 🎨 **Visual Features**
- **Message Types**: Color-coded borders for different message types
- **User Levels**: Level badges next to usernames
- **Reactions**: Emoji reactions with counts
- **Avatars**: Clickable user profile pictures
- **Type Icons**: Visual indicators for challenges, tricks, sessions
- **Professional Styling**: Modern chat bubble design

### 🔄 **Interactive Features**
- **Quick Reactions**: Tap heart to show emoji picker (🔥🛹💯😂👏)
- **User Profiles**: Tap avatar/name to view user profile
- **Auto-scroll**: Automatically scrolls to new messages
- **Loading States**: Spinner while fetching messages
- **Empty State**: Friendly message when chat is empty

## 🎯 Usage

### Basic Implementation
```javascript
import ChatMessageList from '../components/ChatMessageList';

const messages = [
  {
    id: "m1",
    user: { avatar: "url", name: "Username", level: 12 },
    text: "Message content",
    time: new Date(),
    type: "text",
    reactions: { "🔥": 2 }
  }
];

<ChatMessageList messages={messages} />
```

### With Reactions
```javascript
const handleReaction = async (messageId, emoji) => {
  await chatService.reactToMessage(messageId, emoji);
};

<ChatMessageList 
  messages={messages}
  onReaction={handleReaction}
/>
```

### With User Interaction
```javascript
const handleUserPress = (user) => {
  navigation.navigate('Profile', { userId: user.id });
};

<ChatMessageList 
  messages={messages}
  onUserPress={handleUserPress}
/>
```

### Complete Chat Setup
```javascript
import ChatMessageList from '../components/ChatMessageList';
import ChatBar from '../components/ChatBar';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  
  return (
    <KeyboardAvoidingView style={styles.container}>
      <ChatMessageList 
        messages={messages}
        onReaction={handleReaction}
        onUserPress={handleUserPress}
      />
      <ChatBar onSend={handleSendMessage} />
    </KeyboardAvoidingView>
  );
}
```

## 📊 Message Data Structure

```javascript
{
  id: "unique_message_id",
  user: {
    avatar: "https://avatar-url.com",
    name: "Username",
    level: 15 // Optional user level
  },
  text: "Message content",
  time: Date object,
  type: "text|challenge|trick|session",
  reactions: {
    "🔥": 3,
    "🛹": 1,
    "💯": 2
  }
}
```

## 🎨 Message Types & Styling

| Type | Border Color | Icon | Use Case |
|------|-------------|------|----------|
| text | None | - | Regular chat messages |
| challenge | `#FFD600` | ⚔️ | Challenge notifications |
| trick | `#FF6B9D` | 🛹 | Trick completion messages |
| session | `#4ECDC4` | 📍 | Session join/leave messages |

## 🔧 Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | Array | `mockMessages` | Array of message objects |
| `onReaction` | Function | `null` | Callback when user reacts to message |
| `onUserPress` | Function | `null` | Callback when user taps avatar/name |
| `loading` | Boolean | `false` | Shows loading spinner |

## 🎛 Advanced Features

### Real-time Chat Integration
```javascript
useEffect(() => {
  const unsubscribe = chatService.listenToMessages(
    roomId,
    (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
    }
  );
  
  return () => unsubscribe();
}, [roomId]);
```

### Message Filtering
```javascript
// Filter by message type
const trickMessages = messages.filter(msg => msg.type === 'trick');

// Filter by user
const userMessages = messages.filter(msg => msg.user.name === 'Username');

// Filter by time (last hour)
const recentMessages = messages.filter(msg => 
  Date.now() - msg.time.getTime() < 3600000
);
```

### Custom Reactions
```javascript
// Override quick reaction emojis
const customQuickEmojis = ['🛹', '🔥', '💀', '👑', '🎯'];

// Add custom reaction logic
const handleCustomReaction = (messageId, emoji) => {
  // Your custom reaction handling
  console.log(`Reacted with ${emoji} to message ${messageId}`);
};
```

## 📱 Layout Integration

### With Fixed ChatBar
```javascript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181b1e'
  },
  // ChatMessageList automatically adds bottom padding for ChatBar
});

<View style={styles.container}>
  <ChatMessageList messages={messages} />
  <ChatBar onSend={handleSend} />
</View>
```

### In Tab Navigator
```javascript
// Chat screen in tab navigator
export default function ChatTab() {
  return (
    <SafeAreaView style={styles.container}>
      <ChatMessageList messages={messages} />
      <ChatBar onSend={handleSend} />
    </SafeAreaView>
  );
}
```

### Modal Chat
```javascript
<Modal visible={showChat} animationType="slide">
  <View style={styles.modalContainer}>
    <ChatMessageList messages={messages} />
    <ChatBar onSend={handleSend} />
  </View>
</Modal>
```

## 🔍 Search & Filtering

### Search Messages
```javascript
const [searchTerm, setSearchTerm] = useState('');

const filteredMessages = messages.filter(msg =>
  msg.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
  msg.user.name.toLowerCase().includes(searchTerm.toLowerCase())
);

<ChatMessageList messages={filteredMessages} />
```

### Filter by Date
```javascript
const todayMessages = messages.filter(msg => {
  const today = new Date().toDateString();
  return msg.time.toDateString() === today;
});
```

## 🚀 Performance Tips

1. **Message Pagination**: Load messages in batches
2. **Virtual Scrolling**: For very large chat histories
3. **Image Optimization**: Optimize avatar images
4. **Reaction Debouncing**: Prevent spam reactions
5. **Auto-cleanup**: Remove old messages from state

## 🎯 Integration with Other Components

### With LiveSeshScreen
```javascript
export default function LiveSeshScreen() {
  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Session content */}
      </ScrollView>
      
      {/* Fixed chat at bottom */}
      <View style={styles.chatContainer}>
        <ChatMessageList messages={sessionMessages} />
        <ChatBar onSend={handleSessionMessage} />
      </View>
    </View>
  );
}
```

### With Challenge Notifications
```javascript
// Send challenge message
const sendChallengeMessage = (challengeData) => {
  const message = {
    id: generateId(),
    user: currentUser,
    text: `⚔️ Challenge sent to @${challengeData.skater.username}!`,
    time: new Date(),
    type: 'challenge',
    reactions: {}
  };
  
  setMessages(prev => [...prev, message]);
};
```

## 🔥 Ready Features

- ✅ Auto-scroll to new messages
- ✅ Message reactions with emoji picker
- ✅ User level badges
- ✅ Message type indicators
- ✅ Clickable user profiles
- ✅ Loading and empty states
- ✅ Responsive design
- ✅ Keyboard handling
- ✅ Real-time message support
- ✅ Professional styling

Perfect for creating engaging chat experiences in your skate community! 🛹💬
