import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { subscribeToChallenges, updateChallengeStatus, makeChallengeMove } from '../../api/challengeApi';
import { getUserProfiles } from '../../api/authApi';
import { auth } from '../../services/firebase';

export default function ChallengeScreen() {
  const [challenges, setChallenges] = useState([]);
  const [displayChallenges, setDisplayChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUserId = auth.currentUser?.uid;

  // Subscribe to challenges
  useEffect(() => {
    if (!currentUserId) return;

    const unsubscribe = subscribeToChallenges(currentUserId, (challengeData) => {
      setChallenges(challengeData);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  // Enrich challenges with user data
  useEffect(() => {
    async function enrichChallenges() {
      if (!challenges.length) {
        setDisplayChallenges([]);
        return;
      }

      try {
        // Get all unique user IDs from challenges
        const userIds = challenges.map(c => 
          c.fromUserId === currentUserId ? c.toUserId : c.fromUserId
        );
        
        // Fetch all user profiles in one batch
        const userProfiles = await getUserProfiles(userIds);

        // Enrich challenges with user data
        const enriched = challenges.map(challenge => {
          const opponentId = challenge.fromUserId === currentUserId ? 
            challenge.toUserId : challenge.fromUserId;
          const opponent = userProfiles[opponentId];
          
          return {
            ...challenge,
            opponent: opponent?.username || 'Unknown User',
            opponentAvatar: opponent?.avatar,
            isYourTurn: challenge.currentTurn === currentUserId,
          };
        });

        setDisplayChallenges(enriched);
      } catch (error) {
        console.error('Error enriching challenges:', error);
      }
    }

    setLoading(true);
    enrichChallenges().finally(() => setLoading(false));
  }, [challenges, currentUserId]);

  async function handleAccept(id) {
    try {
      await updateChallengeStatus(id, 'accepted');
    } catch (error) {
      alert('Failed to accept challenge: ' + error.message);
    }
  }

  async function handleDecline(id) {
    try {
      await updateChallengeStatus(id, 'declined');
    } catch (error) {
      alert('Failed to decline challenge: ' + error.message);
    }
  }

  async function handlePlay(id) {
    const challenge = challenges.find(c => c.id === id);
    if (!challenge) return;

    try {
      // In a real app, you'd show a trick selection UI here
      const nextTurn = challenge.fromUserId === currentUserId ? 
        challenge.toUserId : challenge.fromUserId;
      
      await makeChallengeMove(id, challenge.letters + 'S', nextTurn);
    } catch (error) {
      alert('Failed to make move: ' + error.message);
    }
  }

  if (!currentUserId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Please log in to view challenges</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Game of S.K.A.T.E. Challenges</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#4a90e2" style={styles.loader} />
      ) : (
        <FlatList
          data={displayChallenges}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={[
              styles.challengeCard,
              item.status === 'pending' && styles.pendingCard,
              item.status === 'accepted' && styles.activeCard
            ]}>
              <Text style={styles.opponent}>
                vs @{item.opponent} ({item.type.toUpperCase()})
              </Text>
              <Text style={styles.letters}>
                Letters: <Text style={styles.lettersValue}>{item.letters || 'None'}</Text>
              </Text>
              <Text style={styles.status}>
                {item.status === 'pending' ? 'Waiting for response' :
                 item.isYourTurn ? 'Your turn!' : "Opponent's turn"}
              </Text>
              <View style={styles.actions}>
                {item.status === 'pending' && (
                  <>
                    <TouchableOpacity 
                      style={styles.actionBtn} 
                      onPress={() => handleAccept(item.id)}
                    >
                      <Text style={styles.btnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: '#e74c3c' }]} 
                      onPress={() => handleDecline(item.id)}
                    >
                      <Text style={styles.btnText}>Decline</Text>
                    </TouchableOpacity>
                  </>
                )}
                {item.status === 'accepted' && item.isYourTurn && (
                  <TouchableOpacity 
                    style={styles.actionBtn} 
                    onPress={() => handlePlay(item.id)}
                  >
                    <Text style={styles.btnText}>Play Turn</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No active challenges</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontWeight: 'bold', fontSize: 21, marginBottom: 18 },
  challengeCard: { 
    backgroundColor: '#f5f7fa', 
    borderRadius: 14, 
    padding: 17, 
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#f5f7fa'
  },
  pendingCard: { borderColor: '#f39c12' },
  activeCard: { borderColor: '#2ecc71' },
  opponent: { fontWeight: 'bold', fontSize: 17, marginBottom: 6 },
  letters: { fontSize: 14, color: '#666' },
  lettersValue: { fontWeight: 'bold', color: '#e67e22', fontSize: 15 },
  status: { fontSize: 13, color: '#4a90e2', marginTop: 5, marginBottom: 6 },
  actions: { flexDirection: 'row', marginTop: 4 },
  actionBtn: { backgroundColor: '#222', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16, marginRight: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24 },
});
