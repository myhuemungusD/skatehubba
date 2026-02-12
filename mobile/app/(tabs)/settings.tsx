import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SKATE } from "@/theme";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase.config";
import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

type SettingItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
  danger?: boolean;
};

function SettingItem({
  icon,
  title,
  subtitle,
  onPress,
  showChevron = true,
  rightElement,
  danger,
}: SettingItemProps) {
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress && !rightElement}
    >
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? SKATE.colors.blood : SKATE.colors.orange} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && styles.settingTitleDanger]}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement ||
        (showChevron && onPress && (
          <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
        ))}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { user, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  // Load notification preferences from server
  useEffect(() => {
    if (!isAuthenticated) return;
    apiRequest<{ pushEnabled?: boolean; emailEnabled?: boolean }>("/api/notifications/preferences")
      .then((prefs) => {
        if (prefs.pushEnabled !== undefined) setPushEnabled(prefs.pushEnabled);
        if (prefs.emailEnabled !== undefined) setEmailEnabled(prefs.emailEnabled);
      })
      .catch(() => {
        /* use defaults */
      });
  }, [isAuthenticated]);

  const updatePref = useCallback(async (key: string, value: boolean) => {
    try {
      await apiRequest("/api/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      // Revert on failure will be handled by the toggle
    }
  }, []);

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace("/(tabs)");
          } catch (error) {
            console.error("Sign out error:", error);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This action cannot be undone. All your data, game history, and profile information will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Coming Soon",
              "Account deletion is not yet available. This feature requires a backend endpoint and confirmation flow that are currently in development."
            );
          },
        },
      ]
    );
  };

  // Unauthenticated users are redirected to sign-in by the root layout guard.
  // If somehow reached without auth, show nothing while redirect occurs.
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={SKATE.colors.orange} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.sectionContent}>
          <SettingItem
            icon="person"
            title="Edit Profile"
            subtitle="Update your name, photo, and bio"
            onPress={() => router.push(`/profile/${user?.uid}`)}
          />
          <SettingItem
            icon="mail"
            title="Email"
            subtitle={user?.email || "Not set"}
            showChevron={false}
          />
          <SettingItem
            icon="key"
            title="Change Password"
            onPress={() => Alert.alert("Coming Soon", "Password change will be available soon.")}
          />
        </View>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.sectionContent}>
          <SettingItem
            icon="notifications"
            title="Push Notifications"
            subtitle="Get notified about challenges and updates"
            showChevron={false}
            rightElement={
              <Switch
                value={pushEnabled}
                onValueChange={(val) => {
                  setPushEnabled(val);
                  updatePref("pushEnabled", val);
                }}
                trackColor={{ false: SKATE.colors.darkGray, true: SKATE.colors.orange }}
                thumbColor={SKATE.colors.white}
              />
            }
          />
          <SettingItem
            icon="mail"
            title="Email Notifications"
            subtitle="Receive emails for game events"
            showChevron={false}
            rightElement={
              <Switch
                value={emailEnabled}
                onValueChange={(val) => {
                  setEmailEnabled(val);
                  updatePref("emailEnabled", val);
                }}
                trackColor={{ false: SKATE.colors.darkGray, true: SKATE.colors.orange }}
                thumbColor={SKATE.colors.white}
              />
            }
          />
          <SettingItem
            icon="location"
            title="Location Services"
            subtitle="Enable to find nearby spots"
            showChevron={false}
            rightElement={
              <Switch
                value={locationEnabled}
                onValueChange={setLocationEnabled}
                trackColor={{ false: SKATE.colors.darkGray, true: SKATE.colors.orange }}
                thumbColor={SKATE.colors.white}
              />
            }
          />
          <SettingItem
            icon="moon"
            title="Appearance"
            subtitle="Dark mode (always on)"
            showChevron={false}
          />
        </View>
      </View>

      {/* Support Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.sectionContent}>
          <SettingItem
            icon="help-circle"
            title="Help & FAQ"
            onPress={() =>
              Alert.alert(
                "Coming Soon",
                "Help & FAQ section is coming soon. We're building a comprehensive knowledge base to answer your questions."
              )
            }
          />
          <SettingItem
            icon="chatbubble"
            title="Contact Us"
            onPress={() =>
              Alert.alert(
                "Coming Soon",
                "Contact form is coming soon. In the meantime, reach out to us at support@skatehubba.com."
              )
            }
          />
          <SettingItem
            icon="document-text"
            title="Terms of Service"
            onPress={() => Alert.alert("Coming Soon", "Terms of service will be available soon.")}
          />
          <SettingItem
            icon="shield-checkmark"
            title="Privacy Policy"
            onPress={() => Alert.alert("Coming Soon", "Privacy policy will be available soon.")}
          />
        </View>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Actions</Text>
        <View style={styles.sectionContent}>
          <SettingItem
            icon="log-out"
            title="Sign Out"
            onPress={handleSignOut}
            showChevron={false}
          />
          <SettingItem
            icon="trash"
            title="Delete Account"
            onPress={handleDeleteAccount}
            showChevron={false}
            danger
          />
        </View>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>SkateHubba v1.0.0</Text>
        <Text style={styles.appCopyright}>Made with love for skaters</Text>
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
  section: {
    marginTop: SKATE.spacing.lg,
  },
  sectionTitle: {
    color: SKATE.colors.gray,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginLeft: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.sm,
  },
  sectionContent: {
    backgroundColor: SKATE.colors.grime,
    marginHorizontal: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: SKATE.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SKATE.spacing.md,
  },
  settingIconDanger: {
    backgroundColor: "rgba(255, 26, 26, 0.2)",
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    color: SKATE.colors.white,
    fontSize: 16,
  },
  settingTitleDanger: {
    color: SKATE.colors.blood,
  },
  settingSubtitle: {
    color: SKATE.colors.gray,
    fontSize: 13,
    marginTop: 2,
  },
  appInfo: {
    alignItems: "center",
    padding: SKATE.spacing.xl,
    marginTop: SKATE.spacing.lg,
  },
  appVersion: {
    color: SKATE.colors.gray,
    fontSize: 14,
  },
  appCopyright: {
    color: SKATE.colors.darkGray,
    fontSize: 12,
    marginTop: SKATE.spacing.xs,
  },
  bottomPadding: {
    height: 40,
  },
});
