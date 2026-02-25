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
import { ScreenErrorBoundary } from "@/components/common/ScreenErrorBoundary";
import { signOut, sendPasswordResetEmail, deleteUser } from "firebase/auth";
import { auth } from "@/lib/firebase.config";
import * as Linking from "expo-linking";
import { openLink } from "@/lib/linking";
import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { removePushTokenFromServer } from "@/lib/pushNotifications";
import Constants from "expo-constants";

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

function SettingsScreenContent() {
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
            await removePushTokenFromServer();
            await signOut(auth);
            router.replace("/(tabs)");
          } catch (error) {
            if (__DEV__) {
              console.error("Sign out error:", error);
            }
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account, game history, and all profile data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            const currentUser = auth.currentUser;
            if (!currentUser) return;
            try {
              // Delete Firebase account first — if this requires re-auth, nothing
              // server-side has been touched yet and the user can try again.
              await deleteUser(currentUser);
              // Firebase account gone; now clean up server-side data.
              try {
                await removePushTokenFromServer();
              } catch {
                // Non-fatal — push token cleanup failure doesn't block deletion.
              }
              await apiRequest("/api/profile", { method: "DELETE" });
              // Auth state listener will redirect; explicit replace ensures immediate
              // navigation even if the listener fires with a slight delay.
              router.replace("/auth/sign-in");
            } catch (error: unknown) {
              const code = (error as { code?: string })?.code;
              if (code === "auth/requires-recent-login") {
                Alert.alert(
                  "Re-authentication Required",
                  "For security, please sign out and sign back in before deleting your account."
                );
              } else {
                Alert.alert("Error", "Failed to delete account. Please try again.");
              }
            }
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
            onPress={async () => {
              if (!user?.email) {
                Alert.alert(
                  "No Email Address",
                  "Your account doesn't have an email address associated with it. Password reset is not available."
                );
                return;
              }
              try {
                await sendPasswordResetEmail(auth, user.email);
                Alert.alert(
                  "Password Reset Sent",
                  `A password reset link has been sent to ${user.email}. Check your inbox.`
                );
              } catch {
                Alert.alert("Error", "Failed to send password reset email. Try again.");
              }
            }}
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
                accessibilityRole="switch"
                accessibilityLabel="Push Notifications"
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
                accessibilityRole="switch"
                accessibilityLabel="Email Notifications"
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
                accessibilityRole="switch"
                accessibilityLabel="Location Services"
                value={locationEnabled}
                onValueChange={(val) => {
                  setLocationEnabled(val);
                  updatePref("locationEnabled", val);
                }}
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
            onPress={() => router.push("/settings/faq")}
          />
          <SettingItem
            icon="chatbubble"
            title="Contact Us"
            onPress={() => Linking.openURL("mailto:support@skatehubba.com")}
          />
          <SettingItem
            icon="document-text"
            title="Terms of Service"
            onPress={() => openLink("https://skatehubba.com/terms")}
          />
          <SettingItem
            icon="shield-checkmark"
            title="Privacy Policy"
            onPress={() => openLink("https://skatehubba.com/privacy")}
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
        <Text style={styles.appVersion}>
          SkateHubba v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
        <Text style={styles.appCopyright}>Made with love for skaters</Text>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return (
    <ScreenErrorBoundary screenName="Settings">
      <SettingsScreenContent />
    </ScreenErrorBoundary>
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
