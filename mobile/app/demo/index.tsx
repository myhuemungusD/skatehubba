import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useEffect } from "react";
import { SKATE } from "@/theme";

interface DemoScreen {
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
}

const DEMO_SCREENS: DemoScreen[] = [
  {
    route: "/demo/battle",
    icon: "flash",
    title: "S.K.A.T.E. Battle",
    subtitle: "Live game in progress — Round 6",
    color: SKATE.colors.orange,
  },
  {
    route: "/demo/judging",
    icon: "eye",
    title: "Judging Phase",
    subtitle: "Both players vote: Landed or Bailed",
    color: SKATE.colors.gold,
  },
  {
    route: "/demo/result",
    icon: "trophy",
    title: "Victory Screen",
    subtitle: "Post-game stats and trick history",
    color: SKATE.colors.neon,
  },
  {
    route: "/demo/lobby",
    icon: "game-controller",
    title: "Game Lobby",
    subtitle: "Active challenges and matchmaking",
    color: "#3b82f6",
  },
  {
    route: "/demo/leaderboard",
    icon: "podium",
    title: "Leaderboard",
    subtitle: "Global rankings and top skaters",
    color: SKATE.colors.gold,
  },
  {
    route: "/demo/profile",
    icon: "person",
    title: "Player Profile",
    subtitle: "Stats, achievements, and challenge button",
    color: SKATE.colors.blood,
  },
];

export default function DemoIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
    >
      <Animated.View
        style={[
          styles.heroSection,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Brand Header */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="flash" size={28} color={SKATE.colors.white} />
          </View>
          <View>
            <Text style={styles.brandTitle}>SkateHubba</Text>
            <Text style={styles.brandVersion}>Mobile Preview v1.0</Text>
          </View>
        </View>

        {/* Hero Copy */}
        <Text style={styles.heroTitle}>
          The World's First{"\n"}Async S.K.A.T.E. Battle App
        </Text>
        <Text style={styles.heroSubtitle}>
          Record tricks. Challenge friends. Judge each other.{"\n"}
          No live play needed — play anytime, anywhere.
        </Text>

        {/* Key Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>1v1</Text>
            <Text style={styles.metricLabel}>Battles</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>15s</Text>
            <Text style={styles.metricLabel}>Max Clip</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>120fps</Text>
            <Text style={styles.metricLabel}>Slo-Mo</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>24h</Text>
            <Text style={styles.metricLabel}>Turns</Text>
          </View>
        </View>
      </Animated.View>

      {/* Demo Screens */}
      <View style={styles.screensSection}>
        <Text style={styles.sectionTitle}>DEMO SCREENS</Text>
        <Text style={styles.sectionSubtitle}>
          Tap any screen to preview the mobile experience
        </Text>

        {DEMO_SCREENS.map((screen) => (
          <TouchableOpacity
            key={screen.route}
            style={styles.screenCard}
            onPress={() => router.push(screen.route)}
            activeOpacity={0.7}
          >
            <View style={[styles.screenIcon, { backgroundColor: screen.color }]}>
              <Ionicons name={screen.icon} size={24} color={SKATE.colors.white} />
            </View>
            <View style={styles.screenInfo}>
              <Text style={styles.screenTitle}>{screen.title}</Text>
              <Text style={styles.screenSubtitle}>{screen.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Tech Stack */}
      <View style={styles.techSection}>
        <Text style={styles.sectionTitle}>TECH STACK</Text>
        <View style={styles.techGrid}>
          {[
            { label: "Expo", detail: "v54 + Router" },
            { label: "React Native", detail: "v0.83" },
            { label: "Firebase", detail: "Auth + Firestore" },
            { label: "Vision Camera", detail: "120fps capture" },
            { label: "TypeScript", detail: "Strict mode" },
            { label: "Zustand", detail: "State management" },
          ].map((tech) => (
            <View key={tech.label} style={styles.techChip}>
              <Text style={styles.techLabel}>{tech.label}</Text>
              <Text style={styles.techDetail}>{tech.detail}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Back to app */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace("/(tabs)")}
      >
        <Ionicons name="arrow-back" size={20} color={SKATE.colors.white} />
        <Text style={styles.backButtonText}>Back to App</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SKATE.colors.ink,
  },
  heroSection: {
    paddingHorizontal: SKATE.spacing.xl,
    marginBottom: SKATE.spacing.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SKATE.spacing.md,
    marginBottom: SKATE.spacing.xxl,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: SKATE.borderRadius.md,
    backgroundColor: SKATE.colors.orange,
    justifyContent: "center",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: SKATE.colors.white,
    fontStyle: "italic",
  },
  brandVersion: {
    fontSize: 12,
    color: SKATE.colors.orange,
    fontWeight: "600",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: SKATE.colors.white,
    lineHeight: 34,
    marginBottom: SKATE.spacing.md,
  },
  heroSubtitle: {
    fontSize: 15,
    color: SKATE.colors.lightGray,
    lineHeight: 22,
    marginBottom: SKATE.spacing.xl,
  },
  metricsRow: {
    flexDirection: "row",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: SKATE.colors.orange,
  },
  metricLabel: {
    fontSize: 11,
    color: SKATE.colors.lightGray,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricDivider: {
    width: 1,
    backgroundColor: SKATE.colors.darkGray,
  },
  screensSection: {
    paddingHorizontal: SKATE.spacing.xl,
    marginBottom: SKATE.spacing.xl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: SKATE.colors.gray,
    letterSpacing: 2,
    marginBottom: SKATE.spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: SKATE.colors.lightGray,
    marginBottom: SKATE.spacing.lg,
  },
  screenCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.lg,
    padding: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.md,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  screenIcon: {
    width: 48,
    height: 48,
    borderRadius: SKATE.borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SKATE.spacing.md,
  },
  screenInfo: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  screenSubtitle: {
    fontSize: 13,
    color: SKATE.colors.lightGray,
    marginTop: 2,
  },
  techSection: {
    paddingHorizontal: SKATE.spacing.xl,
    marginBottom: SKATE.spacing.xl,
  },
  techGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SKATE.spacing.sm,
    marginTop: SKATE.spacing.md,
  },
  techChip: {
    backgroundColor: SKATE.colors.grime,
    borderRadius: SKATE.borderRadius.md,
    paddingHorizontal: SKATE.spacing.md,
    paddingVertical: SKATE.spacing.sm,
    borderWidth: 1,
    borderColor: SKATE.colors.darkGray,
  },
  techLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: SKATE.colors.white,
  },
  techDetail: {
    fontSize: 11,
    color: SKATE.colors.lightGray,
    marginTop: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SKATE.spacing.sm,
    marginHorizontal: SKATE.spacing.xl,
    paddingVertical: SKATE.spacing.lg,
    backgroundColor: SKATE.colors.darkGray,
    borderRadius: SKATE.borderRadius.md,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: SKATE.colors.white,
  },
});
