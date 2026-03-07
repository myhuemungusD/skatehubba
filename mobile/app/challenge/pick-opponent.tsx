import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { UsersSkeleton } from "@/components/common/Skeleton";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { useRequireAuth } from "@/hooks/useRequireAuth";

interface User {
  id: string;
  displayName: string;
  photoURL: string | null;
}

function PickOpponentContent() {
  const { isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest<User[]>("/api/users"),
  });

  const filteredUsers = users?.filter((user: User) =>
    user.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  const handlePickUser = useCallback(
    (user: User) => {
      router.push({
        pathname: "/challenge/new",
        params: { opponentUid: user.id },
      });
    },
    [router]
  );

  const renderUser = useCallback(
    ({ item }: { item: User }) => (
      <TouchableOpacity
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Challenge ${item.displayName || "Skater"}`}
        style={styles.userCard}
        onPress={() => handlePickUser(item)}
      >
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {item.displayName?.charAt(0).toUpperCase() || "S"}
            </Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name}>{item.displayName || "Skater"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
      </TouchableOpacity>
    ),
    [handlePickUser]
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color={SKATE.colors.lightGray}
          style={styles.searchIcon}
        />
        <TextInput
          accessible
          accessibilityLabel="Search skaters to challenge"
          style={styles.searchInput}
          placeholder="Search skaters..."
          placeholderTextColor={SKATE.colors.gray}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {isLoading ? (
        <UsersSkeleton />
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={64} color={SKATE.colors.blood} />
          <Text style={styles.emptyTitle}>Failed to Load</Text>
          <Text style={styles.emptyText}>
            Could not load skaters. Check your connection and try again.
          </Text>
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Retry loading skaters"
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh" size={20} color={SKATE.colors.white} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredUsers?.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={SKATE.colors.orange} />
          <Text style={styles.emptyTitle}>No Skaters Found</Text>
          <Text style={styles.emptyText}>
            {search ? "No skaters match your search" : "Invite your crew to join SkateHubba"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

export default function PickOpponentScreen() {
  return (
    <ScreenErrorBoundary screenName="Pick Opponent">
      <PickOpponentContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    margin: SKATE.spacing.lg,
    paddingHorizontal: SKATE.spacing.md,
    borderRadius: SKATE.borderRadius.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  searchIcon: {
    marginRight: SKATE.spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    paddingVertical: SKATE.spacing.md,
  },
  list: {
    paddingHorizontal: SKATE.spacing.lg,
    gap: SKATE.spacing.md,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: SKATE.spacing.md,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: SKATE.spacing.md,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: SKATE.colors.orange,
    fontSize: SKATE.fontSize.xxl,
    fontWeight: SKATE.fontWeight.bold,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
    color: SKATE.colors.white,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SKATE.spacing.xxl,
  },
  emptyTitle: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.xxl,
    fontWeight: SKATE.fontWeight.bold,
    marginTop: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.sm,
  },
  emptyText: {
    color: SKATE.colors.lightGray,
    fontSize: SKATE.fontSize.md,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.sm,
    backgroundColor: SKATE.colors.blood,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.lg,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  retryButtonText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    fontWeight: SKATE.fontWeight.bold,
  },
});
