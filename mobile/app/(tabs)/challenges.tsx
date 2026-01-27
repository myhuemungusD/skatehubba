import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase.config';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useRouter } from 'expo-router';
import { Challenge } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SKATE } from '@/theme';

export default function ChallengesScreen() {
  const { user, isAuthenticated } = useRequireAuth();
  const router = useRouter();

  const { data: challenges, isLoading } = useQuery({
    queryKey: ['challenges', user?.uid],
    queryFn: async () => {
      if (!user) return [];

      const q = query(
        collection(db, 'challenges'),
        where('participants', 'array-contains', user.uid)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        deadline: doc.data().deadline?.toDate(),
      })) as Challenge[];
    },
    enabled: !!user,
  });

  // Show sign-in prompt for guests
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.guestContainer}>
          <View style={styles.playIconContainer}>
            <Ionicons name="play" size={64} color={SKATE.colors.orange} />
          </View>
          <Text style={styles.guestTitle}>Play S.K.A.T.E.</Text>
          <Text style={styles.guestText}>
            Challenge skaters worldwide in the classic game of S.K.A.T.E.
            Record your tricks, send challenges, and climb the leaderboard!
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="videocam" size={20} color={SKATE.colors.orange} />
              <Text style={styles.featureText}>Record 15-second trick clips</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="people" size={20} color={SKATE.colors.orange} />
              <Text style={styles.featureText}>Challenge any skater</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="trophy" size={20} color={SKATE.colors.orange} />
              <Text style={styles.featureText}>Earn points and rank up</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/auth/sign-in')}
          >
            <Ionicons name="log-in" size={20} color={SKATE.colors.white} />
            <Text style={styles.signInButtonText}>Sign In to Play</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderChallenge = ({ item }: { item: Challenge }) => {
    const isCreator = item.createdBy === user?.uid;
    const opponentId = isCreator ? item.opponent : item.createdBy;
    
    return (
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${isCreator ? 'Your challenge' : 'Challenge from opponent'} versus ${opponentId}, deadline ${format(item.deadline, 'MMM d, h:mm a')}, status ${item.status}`}
        style={styles.card}
        onPress={() => router.push(`/challenge/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {isCreator ? 'Your Challenge' : 'Challenge from Opponent'}
          </Text>
          <StatusBadge status={item.status} />
        </View>
        
        <Text style={styles.opponent}>vs. {opponentId}</Text>
        <Text style={styles.deadline}>
          Deadline: {format(item.deadline, 'MMM d, h:mm a')}
        </Text>
        
        {item.status === 'pending' && !isCreator && (
          <TouchableOpacity 
            accessible
            accessibilityRole="button"
            accessibilityLabel="Respond to challenge now"
            style={styles.respondButton}
          >
            <Text style={styles.respondButtonText}>Respond Now</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel="Create new S.K.A.T.E. challenge"
        style={styles.createButton}
        onPress={() => router.push('/challenge/new' as any)}
      >
        <Ionicons name="add-circle" size={24} color={SKATE.colors.white} />
        <Text style={styles.createButtonText}>New Challenge</Text>
      </TouchableOpacity>

      {isLoading ? (
        <Text style={styles.loadingText}>Loading challenges...</Text>
      ) : challenges?.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="videocam-outline" size={64} color={SKATE.colors.gray} />
          <Text style={styles.emptyText}>No challenges yet</Text>
          <Text style={styles.emptySubtext}>Create your first S.K.A.T.E. challenge!</Text>
        </View>
      ) : (
        <FlatList
          data={challenges}
          renderItem={renderChallenge}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: Challenge['status'] }) {
  const colors = {
    pending: SKATE.colors.orange,
    accepted: '#007aff',
    completed: SKATE.colors.neon,
    forfeit: SKATE.colors.blood,
  };

  return (
    <View style={[styles.badge, { backgroundColor: colors[status] }]}>
      <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  guestContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SKATE.spacing.xl,
  },
  playIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: SKATE.colors.grime,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SKATE.spacing.xl,
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  guestTitle: {
    color: SKATE.colors.white,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: SKATE.spacing.md,
  },
  guestText: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: SKATE.spacing.xl,
    lineHeight: 24,
  },
  featureList: {
    marginBottom: SKATE.spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SKATE.spacing.md,
    gap: SKATE.spacing.md,
  },
  featureText: {
    color: SKATE.colors.white,
    fontSize: 14,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.lg,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
    width: '100%',
  },
  signInButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKATE.colors.orange,
    margin: SKATE.spacing.lg,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  createButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  list: {
    padding: SKATE.spacing.lg,
    gap: SKATE.spacing.md,
  },
  card: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SKATE.spacing.sm,
  },
  cardTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: SKATE.spacing.sm,
    paddingVertical: SKATE.spacing.xs,
    borderRadius: SKATE.borderRadius.sm,
  },
  badgeText: {
    color: SKATE.colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  opponent: {
    color: SKATE.colors.orange,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SKATE.spacing.xs,
  },
  deadline: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
  },
  respondButton: {
    backgroundColor: SKATE.colors.orange,
    padding: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.md,
    alignItems: 'center',
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  respondButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: SKATE.colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: SKATE.spacing.lg,
  },
  emptySubtext: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    marginTop: SKATE.spacing.sm,
  },
  loadingText: {
    color: SKATE.colors.white,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
});
