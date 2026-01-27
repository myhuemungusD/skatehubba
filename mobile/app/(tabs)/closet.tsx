import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function ClosetScreen() {
  const { user, isAuthenticated, checkAuth } = useRequireAuth();
  const router = useRouter();

  // Show sign-in prompt for guests
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.guestContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="shirt-outline" size={80} color={SKATE.colors.gray} />
          </View>
          <Text style={styles.guestTitle}>Your Closet Awaits</Text>
          <Text style={styles.guestText}>
            Sign in to access your personal closet, save your favorite gear, and track your collection
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/auth/sign-in')}
          >
            <Ionicons name="log-in" size={20} color={SKATE.colors.white} />
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createAccountButton}
            onPress={() => router.push('/auth/sign-in')}
          >
            <Text style={styles.createAccountText}>Don't have an account? Create one</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Authenticated user view
  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {user?.displayName?.charAt(0).toUpperCase() || 'S'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.userName}>{user?.displayName || 'Skater'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Wishlist</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push(`/profile/${user?.uid}` as any)}
          >
            <Ionicons name="person" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>My Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/leaderboard')}
          >
            <Ionicons name="trophy" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>Leaderboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/users')}
          >
            <Ionicons name="people" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>Find Skaters</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Ionicons name="settings" size={28} color={SKATE.colors.orange} />
            <Text style={styles.actionText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* My Collection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Collection</Text>
        <View style={styles.emptyCollection}>
          <Ionicons name="cube-outline" size={48} color={SKATE.colors.gray} />
          <Text style={styles.emptyText}>No items in your closet yet</Text>
          <Text style={styles.emptySubtext}>
            Your purchased gear and saved items will appear here
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.push('/(tabs)/shop')}
          >
            <Text style={styles.browseButtonText}>Browse Shop</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
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
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: SKATE.colors.grime,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SKATE.spacing.xl,
  },
  guestTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
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
  createAccountButton: {
    marginTop: SKATE.spacing.lg,
    padding: SKATE.spacing.md,
  },
  createAccountText: {
    color: SKATE.colors.orange,
    fontSize: 14,
  },
  profileHeader: {
    alignItems: 'center',
    padding: SKATE.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  avatarContainer: {
    marginBottom: SKATE.spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: SKATE.colors.grime,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: SKATE.colors.orange,
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: 40,
    fontWeight: 'bold',
  },
  userName: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  userEmail: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    marginTop: SKATE.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SKATE.spacing.xl,
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: SKATE.colors.gray,
    fontSize: 12,
    marginTop: SKATE.spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: SKATE.colors.darkGray,
  },
  section: {
    padding: SKATE.spacing.lg,
  },
  sectionTitle: {
    color: SKATE.colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SKATE.spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SKATE.spacing.md,
  },
  actionCard: {
    width: '47%',
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  actionText: {
    color: SKATE.colors.white,
    fontSize: 14,
    marginTop: SKATE.spacing.sm,
  },
  emptyCollection: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    borderStyle: 'dashed',
  },
  emptyText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: SKATE.spacing.md,
  },
  emptySubtext: {
    color: SKATE.colors.gray,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SKATE.spacing.sm,
  },
  browseButton: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.lg,
  },
  browseButtonText: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});
