import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  Image, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ScrollView,
  Alert,
  ActivityIndicator 
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import ChatMessageList from "../../components/ChatMessageList";
import ChatBar from "../../components/ChatBar";

// Enhanced mock session data
const mockSession = {
  id: "session_123",
  host: { 
    id: "host_1",
    name: "SkateKing", 
    avatar: "https://i.pravatar.cc/100?img=9",
    level: 25
  },
  spot: "Santa Ana Ledge",
  type: "Game of SKATE",
  isLive: true,
  isFull: false,
  maxParticipants: 6,
  sessionStarted: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
  skaters: [
    { 
      id: "u1", 
      name: "FlipTayto", 
      avatar: "https://i.pravatar.cc/100?img=11",
      level: 12,
      status: "skating" // skating, waiting, eliminated
    },
    { 
      id: "u2", 
      name: "MuskaDrip", 
      avatar: "https://i.pravatar.cc/100?img=2",
      level: 8,
      status: "waiting"
    },
    { 
      id: "u3", 
      name: "TechMaster", 
      avatar: "https://i.pravatar.cc/100?img=7",
      level: 18,
      status: "skating"
    }
  ],
  spectators: [
    { 
      id: "s1", 
      name: "SpectateSam", 
      avatar: "https://i.pravatar.cc/100?img=5",
      level: 6
    },
    { 
      id: "s2", 
      name: "ChillWatcher", 
      avatar: "https://i.pravatar.cc/100?img=3",
      level: 10
    }
  ],
  gameState: {
    currentTurn: "u1",
    round: 3,
    letters: {
      "u1": "",
      "u2": "S",
      "u3": "SK"
    }
  }
};

export default function SpectateSessionScreen({ 
  route,
  navigation,
  session = mockSession, 
  onJoin, 
  chatMessages = [], 
  onSendChat
}) {
  const [loading, setLoading] = useState(false);
  const [isSpectating, setIsSpectating] = useState(true);
  
  // Get session data from route params if available
  const { sessionId, sessionData } = route?.params || {};
  const currentSession = sessionData || session;

  const handleJoinSession = async () => {
    if (currentSession.isFull) {
      Alert.alert("Session Full", "This session is currently full. You can still spectate!");
      return;
    }

    setLoading(true);
    try {
      if (onJoin) {
        await onJoin(currentSession);
        setIsSpectating(false);
        Alert.alert("Joined! 🛹", "You've joined the session successfully!");
      } else {
        // Mock join for demo
        Alert.alert("Joined! 🛹", "You've joined the session successfully!");
        setIsSpectating(false);
      }
    } catch (error) {
      Alert.alert("Failed to Join", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUserPress = (user) => {
    if (navigation) {
      navigation.navigate('Profile', { userId: user.id });
    }
  };

  const handleSendChat = (message) => {
    if (onSendChat) {
      onSendChat(message);
    } else {
      // Mock chat for demo
      console.log('Chat message:', message);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'skating': return '🛹';
      case 'waiting': return '⏳';
      case 'eliminated': return '❌';
      default: return '';
    }
  };

  const getGameProgress = () => {
    if (currentSession.type === "Game of SKATE" && currentSession.gameState) {
      return (
        <View style={styles.gameProgress}>
          <Text style={styles.gameProgressTitle}>Game Progress (Round {currentSession.gameState.round})</Text>
          <View style={styles.lettersContainer}>
            {currentSession.skaters.map(skater => (
              <View key={skater.id} style={styles.letterProgress}>
                <Text style={styles.letterPlayerName}>{skater.name}</Text>
                <Text style={styles.letterDisplay}>
                  {currentSession.gameState.letters[skater.id] || "—"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    }
    return null;
  };

  const renderParticipant = ({ item, isSkater = true }) => (
    <TouchableOpacity 
      style={styles.participant}
      onPress={() => handleUserPress(item)}
    >
      <View style={styles.avatarContainer}>
        <Image source={{ uri: item.avatar }} style={styles.participantAvatar} />
        {isSkater && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusIcon}>{getStatusIcon(item.status)}</Text>
          </View>
        )}
        {item.level && (
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{item.level}</Text>
          </View>
        )}
      </View>
      <Text style={styles.participantName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Session Header */}
        <View style={styles.sessionHeader}>
          <View style={styles.hostInfo}>
            <TouchableOpacity onPress={() => handleUserPress(currentSession.host)}>
              <Image source={{ uri: currentSession.host.avatar }} style={styles.hostAvatar} />
            </TouchableOpacity>
            <View style={styles.hostDetails}>
              <Text style={styles.hostName}>{currentSession.host.name} (Host)</Text>
              <View style={styles.sessionInfo}>
                <FontAwesome5 name="map-marker-alt" size={12} color="#FFD600" />
                <Text style={styles.spot}>{currentSession.spot}</Text>
              </View>
              <Text style={styles.sessionType}>{currentSession.type}</Text>
            </View>
          </View>
          
          <View style={styles.sessionBadges}>
            {currentSession.isLive && (
              <View style={styles.liveBadge}>
                <FontAwesome5 name="circle" size={8} color="#FF4444" />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
            <Text style={styles.participantCount}>
              {currentSession.skaters.length}/{currentSession.maxParticipants}
            </Text>
          </View>
        </View>

        {/* Game Progress (for Game of SKATE) */}
        {getGameProgress()}

        {/* Now Skating Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome5 name="skating" size={16} color="#FFD600" />
            <Text style={styles.sectionTitle}>Now Skating ({currentSession.skaters.length})</Text>
          </View>
          <FlatList
            data={currentSession.skaters}
            keyExtractor={item => item.id}
            horizontal
            renderItem={({ item }) => renderParticipant({ item, isSkater: true })}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.participantsList}
          />
        </View>

        {/* Spectators Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome5 name="eye" size={16} color="#FFD600" />
            <Text style={styles.sectionTitle}>Spectators ({currentSession.spectators.length})</Text>
          </View>
          {currentSession.spectators.length > 0 ? (
            <FlatList
              data={currentSession.spectators}
              keyExtractor={item => item.id}
              horizontal
              renderItem={({ item }) => renderParticipant({ item, isSkater: false })}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.participantsList}
            />
          ) : (
            <View style={styles.emptySpectators}>
              <Text style={styles.emptyText}>No spectators yet</Text>
            </View>
          )}
        </View>

        {/* Chat Container */}
        <View style={styles.chatSection}>
          <View style={styles.chatHeader}>
            <FontAwesome5 name="comments" size={16} color="#FFD600" />
            <Text style={styles.chatTitle}>Session Chat</Text>
          </View>
          <View style={styles.chatContainer}>
            <ChatMessageList 
              messages={chatMessages}
              onUserPress={handleUserPress}
            />
          </View>
        </View>
      </ScrollView>

      {/* Join/Spectating Button */}
      {currentSession.isFull || isSpectating ? (
        <View style={styles.spectatingContainer}>
          <View style={styles.spectatingBadge}>
            <FontAwesome5 name="eye" size={16} color="#181b1e" />
            <Text style={styles.spectatingText}>Spectating</Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.joinBtn, loading && styles.joinBtnDisabled]} 
          onPress={handleJoinSession}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#181b1e" size="small" />
          ) : (
            <>
              <FontAwesome5 name="skateboarding" size={18} color="#181b1e" />
              <Text style={styles.joinBtnText}>Join Session</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Chat Bar */}
      <ChatBar onSend={handleSendChat} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181b1e',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFD600',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sessionId: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 30,
  },
  placeholder: {
    backgroundColor: '#242a2f',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#FFD600',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#FFD600',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 16,
  },
  
  // Session info styles
  sessionInfoContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sessionLocation: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  sessionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6C5CE7',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  
  // Host info styles
  hostSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  hostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  hostDetails: {
    flex: 1,
  },
  hostName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  hostLevel: {
    fontSize: 14,
    color: '#6C5CE7',
    marginBottom: 4,
  },
  liveBadge: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Participants styles
  participantsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  participantsList: {
    marginBottom: 20,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  participantLevel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  participantStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  activeStatus: {
    backgroundColor: '#27ae60',
  },
  spectatingStatus: {
    backgroundColor: '#3498db',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Game progress styles
  gameProgressSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  currentTrickContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  currentTrickLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  currentTrick: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  currentSkater: {
    fontSize: 16,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  timeLeft: {
    fontSize: 14,
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  
  // Chat styles
  chatSection: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 16,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  chatCount: {
    fontSize: 14,
    color: '#666',
  },
  
  // Action buttons styles
  actionButtonsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryActionButton: {
    backgroundColor: '#74b9ff',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
