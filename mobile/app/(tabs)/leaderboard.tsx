import { View, Text, StyleSheet, FlatList, Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { LeaderboardEntry } from '@/types';
import { Ionicons } from '@expo/vector-icons';

export default function LeaderboardScreen() {
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['/api/leaderboard'],
    queryFn: () => apiRequest('/api/leaderboard'),
  });

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isTopThree = index < 3;

    return (
      <View style={[styles.row, isTopThree && styles.topThreeRow]}>
        <View style={styles.rankContainer}>
          {index === 0 && <Ionicons name="trophy" size={24} color="#ffd700" />}
          {index === 1 && <Ionicons name="trophy" size={24} color="#c0c0c0" />}
          {index === 2 && <Ionicons name="trophy" size={24} color="#cd7f32" />}
          {index > 2 && <Text style={styles.rank}>{item.rank}</Text>}
        </View>

        <Image
          source={{ uri: item.photoURL || 'https://via.placeholder.com/40' }}
          style={styles.avatar}
        />

        <View style={styles.info}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Text style={styles.stats}>
            {item.totalPoints} pts • {item.spotsUnlocked} spots
          </Text>
        </View>

        <Text style={styles.points}>{item.totalPoints}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      ) : (
        <FlatList
          data={leaderboard}
          renderItem={renderItem}
          keyExtractor={(item) => item.userId}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.headerText}>Top Skaters 🛹</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  topThreeRow: {
    backgroundColor: '#1a1a1a',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rank: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  stats: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  points: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
});
