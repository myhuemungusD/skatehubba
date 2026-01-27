import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SKATE } from '@/theme';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase.config';
import { useState } from 'react';

type SettingItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
  danger?: boolean;
};

function SettingItem({ icon, title, subtitle, onPress, showChevron = true, rightElement, danger }: SettingItemProps) {
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
      {rightElement || (showChevron && onPress && (
        <Ionicons name="chevron-forward" size={20} color={SKATE.colors.gray} />
      ))}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { user, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace('/(tabs)');
            } catch (error) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Would implement account deletion here
            Alert.alert('Coming Soon', 'Account deletion will be available soon.');
          },
        },
      ]
    );
  };

  // Guest view
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.guestContainer}>
          <Ionicons name="settings-outline" size={64} color={SKATE.colors.gray} />
          <Text style={styles.guestTitle}>Settings</Text>
          <Text style={styles.guestText}>
            Sign in to access your account settings
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.push('/auth/sign-in')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
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
            onPress={() => router.push(`/profile/${user?.uid}` as any)}
          />
          <SettingItem
            icon="mail"
            title="Email"
            subtitle={user?.email || 'Not set'}
            showChevron={false}
          />
          <SettingItem
            icon="key"
            title="Change Password"
            onPress={() => Alert.alert('Coming Soon', 'Password change will be available soon.')}
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
                value={notifications}
                onValueChange={setNotifications}
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
            onPress={() => Alert.alert('Coming Soon', 'Help section will be available soon.')}
          />
          <SettingItem
            icon="chatbubble"
            title="Contact Us"
            onPress={() => Alert.alert('Coming Soon', 'Contact form will be available soon.')}
          />
          <SettingItem
            icon="document-text"
            title="Terms of Service"
            onPress={() => Alert.alert('Coming Soon', 'Terms of service will be available soon.')}
          />
          <SettingItem
            icon="shield-checkmark"
            title="Privacy Policy"
            onPress={() => Alert.alert('Coming Soon', 'Privacy policy will be available soon.')}
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
  guestContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SKATE.spacing.xl,
  },
  guestTitle: {
    color: SKATE.colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: SKATE.spacing.lg,
  },
  guestText: {
    color: SKATE.colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    marginTop: SKATE.spacing.sm,
    marginBottom: SKATE.spacing.xl,
  },
  signInButton: {
    backgroundColor: SKATE.colors.orange,
    paddingVertical: SKATE.spacing.lg,
    paddingHorizontal: SKATE.spacing.xxl,
    borderRadius: SKATE.borderRadius.lg,
  },
  signInButtonText: {
    color: SKATE.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  section: {
    marginTop: SKATE.spacing.lg,
  },
  sectionTitle: {
    color: SKATE.colors.gray,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: SKATE.spacing.lg,
    marginBottom: SKATE.spacing.sm,
  },
  sectionContent: {
    backgroundColor: SKATE.colors.grime,
    marginHorizontal: SKATE.spacing.lg,
    borderRadius: SKATE.borderRadius.lg,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SKATE.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: SKATE.colors.darkGray,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: SKATE.colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SKATE.spacing.md,
  },
  settingIconDanger: {
    backgroundColor: 'rgba(255, 26, 26, 0.2)',
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
    alignItems: 'center',
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
