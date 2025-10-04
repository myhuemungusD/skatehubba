// Chat API Service for SkateHubba
import { db, auth } from './firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc
} from 'firebase/firestore';

class ChatService {
  constructor() {
    this.activeListeners = new Map();
  }

  /**
   * Send a chat message
   * @param {string} message - The message content
   * @param {string} roomId - Chat room ID (optional, defaults to global)
   * @param {string} type - Message type (text, image, challenge, etc.)
   */
  async sendMessage(message, roomId = 'global', type = 'text') {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to send messages');
      }

      const messageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: message,
        type: type,
        userId: currentUser.uid,
        username: currentUser.displayName || 'Anonymous Skater',
        userAvatar: currentUser.photoURL || 'https://via.placeholder.com/40',
        roomId: roomId,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString(),
        reactions: {},
        edited: false,
        metadata: {
          platform: 'mobile',
          version: '1.0.0'
        }
      };

      // Add to Firestore
      const docRef = await addDoc(collection(db, 'messages'), messageData);
      
      console.log('Message sent successfully:', docRef.id);
      return { success: true, messageId: docRef.id };

    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Listen to chat messages in real-time
   * @param {string} roomId - Room to listen to
   * @param {function} callback - Function to call when messages update
   * @param {number} messageLimit - Number of messages to load
   */
  listenToMessages(roomId = 'global', callback, messageLimit = 50) {
    try {
      const messagesQuery = query(
        collection(db, 'messages'),
        where('roomId', '==', roomId),
        orderBy('timestamp', 'desc'),
        limit(messageLimit)
      );

      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
          messages.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Reverse to show oldest first
        callback(messages.reverse());
      });

      // Store listener for cleanup
      this.activeListeners.set(roomId, unsubscribe);
      return unsubscribe;

    } catch (error) {
      console.error('Failed to listen to messages:', error);
      throw error;
    }
  }

  /**
   * Send a challenge notification in chat
   * @param {Object} challengeData - Challenge information
   */
  async sendChallengeMessage(challengeData) {
    const challengeMessage = `🛹 Challenge sent to @${challengeData.skater.username}! Game type: ${challengeData.gameType.toUpperCase()}`;
    
    return await this.sendMessage(challengeMessage, 'global', 'challenge');
  }

  /**
   * Send a session join notification
   * @param {string} sessionName - Name of the session
   * @param {string} location - Session location
   */
  async sendSessionJoinMessage(sessionName, location) {
    const joinMessage = `📍 Joined session "${sessionName}" at ${location}`;
    
    return await this.sendMessage(joinMessage, 'global', 'session');
  }

  /**
   * Send a trick completion message
   * @param {string} trickName - Name of the trick
   * @param {string} difficulty - Trick difficulty
   */
  async sendTrickMessage(trickName, difficulty = 'medium') {
    const trickEmojis = {
      easy: '🌟',
      medium: '🔥',
      hard: '💀',
      insane: '👑'
    };
    
    const emoji = trickEmojis[difficulty] || '🛹';
    const trickMessage = `${emoji} Just landed a ${trickName}! #${difficulty}`;
    
    return await this.sendMessage(trickMessage, 'global', 'trick');
  }

  /**
   * React to a message with emoji
   * @param {string} messageId - ID of message to react to
   * @param {string} emoji - Emoji reaction
   */
  async reactToMessage(messageId, emoji) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const messageRef = doc(db, 'messages', messageId);
      
      // Update reactions (simplified - in production you'd want better conflict resolution)
      await updateDoc(messageRef, {
        [`reactions.${currentUser.uid}`]: emoji
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to react to message:', error);
      throw error;
    }
  }

  /**
   * Get chat history for a room
   * @param {string} roomId - Room ID
   * @param {number} limit - Number of messages
   */
  async getChatHistory(roomId = 'global', limit = 50) {
    try {
      const messagesQuery = query(
        collection(db, 'messages'),
        where('roomId', '==', roomId),
        orderBy('timestamp', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(messagesQuery);
      const messages = [];
      
      snapshot.forEach((doc) => {
        messages.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return messages.reverse(); // Show oldest first
    } catch (error) {
      console.error('Failed to get chat history:', error);
      throw error;
    }
  }

  /**
   * Stop listening to a specific room
   * @param {string} roomId - Room to stop listening to
   */
  stopListening(roomId) {
    const unsubscribe = this.activeListeners.get(roomId);
    if (unsubscribe) {
      unsubscribe();
      this.activeListeners.delete(roomId);
    }
  }

  /**
   * Clean up all listeners
   */
  cleanup() {
    this.activeListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.activeListeners.clear();
  }
}

// Export singleton instance
export const chatService = new ChatService();

// Convenience function for simple message sending
export const sendChatAPI = async (message) => {
  return await chatService.sendMessage(message);
};

export default chatService;
