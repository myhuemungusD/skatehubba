import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';

// Placeholder product data
const FEATURED_PRODUCTS = [
  { id: '1', name: 'SkateHubba Deck', price: 59.99, image: null, category: 'Decks' },
  { id: '2', name: 'Pro Wheels Set', price: 45.99, image: null, category: 'Wheels' },
  { id: '3', name: 'Grip Tape Pack', price: 12.99, image: null, category: 'Accessories' },
  { id: '4', name: 'Skate Tool', price: 15.99, image: null, category: 'Tools' },
];

const CATEGORIES = [
  { id: 'decks', name: 'Decks', icon: 'layers' as const },
  { id: 'wheels', name: 'Wheels', icon: 'ellipse' as const },
  { id: 'trucks', name: 'Trucks', icon: 'hardware-chip' as const },
  { id: 'apparel', name: 'Apparel', icon: 'shirt' as const },
  { id: 'accessories', name: 'Accessories', icon: 'bag-handle' as const },
];

export default function ShopScreen() {
  return (
    <ScrollView style={styles.container}>
      {/* Coming Soon Banner */}
      <View style={styles.banner}>
        <Ionicons name="storefront" size={32} color={SKATE.colors.orange} />
        <Text style={styles.bannerTitle}>Shop Coming Soon</Text>
        <Text style={styles.bannerText}>
          Get gear from your favorite skate brands directly in the app
        </Text>
      </View>

      {/* Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
          {CATEGORIES.map((category) => (
            <TouchableOpacity key={category.id} style={styles.categoryCard}>
              <View style={styles.categoryIcon}>
                <Ionicons name={category.icon} size={24} color={SKATE.colors.orange} />
              </View>
              <Text style={styles.categoryName}>{category.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Featured Products */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Featured</Text>
        <View style={styles.productsGrid}>
          {FEATURED_PRODUCTS.map((product) => (
            <TouchableOpacity key={product.id} style={styles.productCard}>
              <View style={styles.productImage}>
                <Ionicons name="cube-outline" size={48} color={SKATE.colors.gray} />
              </View>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productCategory}>{product.category}</Text>
              <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notify Me */}
      <TouchableOpacity style={styles.notifyButton}>
        <Ionicons name="notifications" size={20} color={SKATE.colors.white} />
        <Text style={styles.notifyButtonText}>Notify Me When Shop Opens</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
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
    padding: SKATE.spacing.xl,
    borderRadius: SKATE.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SKATE.colors.orange,
    borderStyle: 'dashed',
  },
  bannerTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: SKATE.spacing.md,
  },
  bannerText: {
    color: SKATE.colors.lightGray,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SKATE.spacing.sm,
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
  categoriesScroll: {
    marginHorizontal: -SKATE.spacing.lg,
    paddingHorizontal: SKATE.spacing.lg,
  },
  categoryCard: {
    alignItems: 'center',
    marginRight: SKATE.spacing.lg,
    width: 70,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SKATE.colors.grime,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  categoryName: {
    color: SKATE.colors.lightGray,
    fontSize: 12,
    marginTop: SKATE.spacing.sm,
    textAlign: 'center',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SKATE.spacing.md,
  },
  productCard: {
    width: '47%',
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  productImage: {
    height: 100,
    backgroundColor: SKATE.colors.darkGray,
    borderRadius: SKATE.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SKATE.spacing.sm,
  },
  productName: {
    color: SKATE.colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  productCategory: {
    color: SKATE.colors.gray,
    fontSize: 12,
    marginTop: 2,
  },
  productPrice: {
    color: SKATE.colors.orange,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: SKATE.spacing.sm,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKATE.colors.orange,
    margin: SKATE.spacing.lg,
    padding: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    gap: SKATE.spacing.sm,
  },
  notifyButtonText: {
    color: SKATE.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});
