import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: "#ff6600",
        tabBarInactiveTintColor: "#666",
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopColor: "#1a1a1a",
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: { backgroundColor: "#0a0a0a" },
        headerTintColor: "#ff6600",
        headerTitleStyle: { fontWeight: "bold", fontSize: 24 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "SkateHubba",
          tabBarLabel: "Hub",
          tabBarAccessibilityLabel: "Hub tab",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Spots",
          tabBarLabel: "Map",
          tabBarAccessibilityLabel: "Spots map tab",
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Play S.K.A.T.E.",
          tabBarLabel: "Play",
          tabBarAccessibilityLabel: "Play S.K.A.T.E. tab",
          tabBarIcon: ({ color, size, focused }) => (
            <View style={[styles.playButton, focused && styles.playButtonActive]}>
              <Ionicons name="play" size={size} color={focused ? "#fff" : color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: "Shop",
          tabBarLabel: "Shop",
          tabBarAccessibilityLabel: "Shop tab",
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="closet"
        options={{
          title: "My Closet",
          tabBarLabel: "Closet",
          tabBarAccessibilityLabel: "Closet tab",
          tabBarIcon: ({ color, size }) => <Ionicons name="shirt" size={size} color={color} />,
        }}
      />
      {/* Hidden screens - accessible via navigation but not in tab bar */}
      <Tabs.Screen
        name="users"
        options={{
          title: "Find Skaters",
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          href: null, // Hide from tab bar, accessible from profile
        }}
      />
      <Tabs.Screen
        name="trickmint"
        options={{
          title: "TrickMint",
          href: null, // Hide from tab bar, accessible via navigation
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },
  playButtonActive: {
    backgroundColor: "#ff6600",
  },
});
