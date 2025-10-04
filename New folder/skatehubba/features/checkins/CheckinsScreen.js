import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { subscribeToCheckIns, addCheckIn, getUserProfiles } from '../../api/authApi';
import { auth } from '../../services/firebase';
import { LoadingScreen, ErrorScreen, EmptyState } from '../../components/StateManagement';
import { asyncHandler } from '../../utils/asyncHandler';

export default function CheckinsScreen() {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [displayCheckins, setDisplayCheckins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [spotCheckins, setSpotCheckins] = useState({});

  // Subscribe to check-ins
  useEffect(() => {
    const unsubscribes = checkins.map(spot => 
      subscribeToCheckIns(spot.id, (updates) => {
        setSpotCheckins(prev => ({
          ...prev,
          [spot.id]: updates
        }));
      })
    );
    return () => unsubscribes.forEach(unsub => unsub());
  }, [checkins]);

  // Enrich check-ins with user data
  useEffect(() => {
    async function enrichCheckins() {
      setLoading(true);
      try {
        const allCheckins = Object.values(spotCheckins).flat();
        const userIds = allCheckins.map(c => c.userId);
        
        // Batch fetch all required user profiles
        const userProfiles = await getUserProfiles(userIds);
        
        const enriched = allCheckins.map(checkin => ({
          ...checkin,
          username: userProfiles[checkin.userId]?.username || 'Unknown User',
          avatar: userProfiles[checkin.userId]?.avatar,
        }));
        
        setDisplayCheckins(enriched);
      } catch (error) {
        console.error('Error enriching check-ins:', error);
      } finally {
        setLoading(false);
      }
    }
    
    const allCheckins = Object.values(spotCheckins).flat();
    if (allCheckins.length) enrichCheckins();
  }, [spotCheckins]);

  async function handleCheckIn(spotId) {
    try {
      await addCheckIn(auth.currentUser.uid, spotId);
      // Real-time subscription will update the UI
    } catch (error) {
      alert('Failed to check in: ' + error.message);
    }
  }

  function renderCheckin({ item }) {
    return (
      <View style={styles.checkinItem}>
        <Image 
          source={item.avatar ? { uri: item.avatar } : require('../../assets/images/profile-demo.png')} 
          style={styles.checkinAvatar}
        />
        <View style={styles.checkinInfo}>
          <Text style={styles.username}>@{item.username}</Text>
          <Text style={styles.timestamp}>
            {new Date(item.checkedInAt?.toDate()).toLocaleTimeString()}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check-ins</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#4a90e2" style={styles.loader} />
      ) : (
        <FlatList
          data={displayCheckins}
          renderItem={renderCheckin}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No check-ins yet. Be the first!</Text>
          }
        />
      )}
    </View>
  );
}

function ProBadge() {
  return <Text style={{ color: '#e67e22', fontWeight: 'bold', fontSize: 13, marginLeft: 4 }}>PRO</Text>;
}
function ShopBadge() {
  return <Text style={{ color: '#4a90e2', fontWeight: 'bold', fontSize: 13, marginLeft: 4 }}>SHOP</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 22 },
  title: { fontWeight: 'bold', fontSize: 22, marginBottom: 18 },
  spotCard: { backgroundColor: '#f5f7fa', borderRadius: 14, padding: 17, marginBottom: 17 },
  checkinItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  checkinAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  checkinInfo: { flex: 1 },
  username: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  timestamp: { fontSize: 12, color: '#666' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  spotName: { fontWeight: 'bold', fontSize: 18 },
  checkBtn: { backgroundColor: '#222', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 18 },
  checkBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  checkedInRow: { flexDirection: 'row', flexWrap: 'wrap' },
  userBubble: { flexDirection: 'row', alignItems: 'center', marginRight: 13, marginBottom: 6, backgroundColor: '#eee', borderRadius: 18, paddingHorizontal: 8, paddingVertical: 3 },
  avatar: { width: 26, height: 26, borderRadius: 13, marginRight: 7, borderWidth: 1, borderColor: '#ccc' },
  username: { fontSize: 14, color: '#333' },
  noneText: { color: '#aaa', fontSize: 13 },
  checkinItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  checkinAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  checkinInfo: { flex: 1 },
  timestamp: { fontSize: 12, color: '#999' },
  loader: { marginTop: 20 },
  emptyText: { textAlign: 'center', color: '#aaa', fontSize: 16, marginTop: 50 },
});
