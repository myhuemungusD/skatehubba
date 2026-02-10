import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";
import { SKATE } from "@/theme";

interface User {
  uid: string;
  displayName: string;
  photoURL: string | null;
  email: string;
}

export default function UsersScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest<User[]>("/api/users"),
  });

  const filteredUsers = users?.filter(
    (user: User) =>
      user.uid !== currentUser?.uid &&
      (user.displayName?.toLowerCase().includes(search.toLowerCase()) ||
        user.email?.toLowerCase().includes(search.toLowerCase()))
  );

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userCard} onPress={() => router.push(`/profile/${item.uid}`)}>
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
        <Text style={styles.email}>{item.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.challengeButton}
        onPress={(e) => {
          e.stopPropagation();
          router.push({
            pathname: "/challenge/new",
            params: { opponentUid: item.uid },
          });
        }}
      >
        <Ionicons name="videocam" size={20} color={SKATE.colors.white} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

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
          style={styles.searchInput}
          placeholder="Search skaters..."
          placeholderTextColor={SKATE.colors.gray}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Loading skaters...</Text>
      ) : filteredUsers?.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={SKATE.colors.orange} />
          <Text style={styles.emptyTitle}>Be the First!</Text>
          <Text style={styles.emptyText}>
            {search ? "No skaters match your search" : "Invite your crew to join SkateHubba"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
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
    padding: SKATE.spacing.lg,
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
  email: {
    fontSize: SKATE.fontSize.sm,
    color: SKATE.colors.lightGray,
    marginTop: 2,
  },
  challengeButton: {
    backgroundColor: SKATE.colors.orange,
    width: SKATE.accessibility.minimumTouchTarget,
    height: SKATE.accessibility.minimumTouchTarget,
    borderRadius: SKATE.accessibility.minimumTouchTarget / 2,
    justifyContent: "center",
    alignItems: "center",
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
  loadingText: {
    color: SKATE.colors.white,
    fontSize: SKATE.fontSize.lg,
    textAlign: "center",
    marginTop: 32,
  },
});
