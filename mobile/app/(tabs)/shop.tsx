import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { openLink } from "@/lib/linking";

const STORE_URL = "https://skatehubba.store";

const CATEGORIES = [
  { id: "decks", name: "Decks", icon: "layers" as const },
  { id: "wheels", name: "Wheels", icon: "ellipse" as const },
  { id: "trucks", name: "Trucks", icon: "hardware-chip" as const },
  { id: "apparel", name: "Apparel", icon: "shirt" as const },
  { id: "accessories", name: "Accessories", icon: "bag-handle" as const },
];

function ShopScreenContent() {
  return (
    <ScrollView style={styles.container}>
      {/* Hero Banner */}
      <View style={styles.banner}>
        <Ionicons name="storefront" size={48} color={SKATE.colors.orange} />
        <Text style={styles.bannerTitle}>SkateHubba Shop</Text>
        <Text style={styles.bannerText}>
          Official gear, decks, apparel, and accessories for the community.
        </Text>
        <TouchableOpacity
          style={styles.visitStoreButton}
          onPress={() => openLink(STORE_URL)}
          accessibilityRole="link"
          accessibilityLabel="Visit SkateHubba Store"
        >
          <Ionicons name="open-outline" size={20} color={SKATE.colors.white} />
          <Text style={styles.visitStoreText}>Visit skatehubba.store</Text>
        </TouchableOpacity>
      </View>

      {/* Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse Categories</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
        >
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={styles.categoryCard}
              onPress={() => openLink(STORE_URL)}
            >
              <View style={styles.categoryIcon}>
                <Ionicons name={category.icon} size={24} color={SKATE.colors.orange} />
              </View>
              <Text style={styles.categoryName}>{category.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Info Cards */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <Ionicons name="cube" size={28} color={SKATE.colors.orange} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Free Shipping</Text>
            <Text style={styles.infoText}>On orders over $50</Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={28} color={SKATE.colors.orange} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Quality Guaranteed</Text>
            <Text style={styles.infoText}>30-day return policy</Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="people" size={28} color={SKATE.colors.orange} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Community Drops</Text>
            <Text style={styles.infoText}>Exclusive collabs with pro skaters</Text>
          </View>
        </View>
      </View>

      {/* Bottom CTA */}
      <TouchableOpacity
        style={styles.bottomCTA}
        onPress={() => openLink(STORE_URL)}
        accessibilityRole="link"
        accessibilityLabel="Shop now at skatehubba.store"
      >
        <Ionicons name="cart" size={20} color={SKATE.colors.white} />
        <Text style={styles.bottomCTAText}>Shop Now</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

export default function ShopScreen() {
  return (
    <ScreenErrorBoundary screenName="Shop">
      <ShopScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  banner: {
    backgroundColor: SKATE.colors.grime,
    margin: SKATE.spacing.lg,
    padding: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  bannerTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: "bold",
    marginTop: SKATE.spacing.md,
  },
  bannerText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    textAlign: "center",
    marginTop: SKATE.spacing.sm,
    lineHeight: 20,
  },
  visitStoreButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.md,
    paddingHorizontal: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.md,
    marginTop: SKATE.spacing.lg,
    gap: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  visitStoreText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  section: {
    padding: SKATE.spacing.lg,
  },
  sectionTitle: {
    color: SKATE.colors.white,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: SKATE.spacing.md,
  },
  categoriesScroll: {
    marginHorizontal: -SKATE.spacing.lg,
    paddingHorizontal: SKATE.spacing.lg,
  },
  categoryCard: {
    alignItems: "center",
    marginRight: SKATE.spacing.lg,
    width: 70,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SKATE.colors.grime,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  categoryName: {
    color: SKATE.colors.lightGray,
    fontSize: 12,
    marginTop: SKATE.spacing.sm,
    textAlign: "center",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
    gap: SKATE.spacing.lg,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  infoText: {
    color: SKATE.colors.lightGray,
    fontSize: 13,
    marginTop: 2,
  },
  bottomCTA: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SKATE.colors.orange,
    margin: SKATE.spacing.lg,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
    minHeight: SKATE.accessibility.minimumTouchTarget,
  },
  bottomCTAText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  bottomPadding: {
    height: 40,
  },
});
