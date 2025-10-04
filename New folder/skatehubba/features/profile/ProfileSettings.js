import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { auth } from '../../services/firebase';
import {
  updatePassword,
  updateEmail,
  deleteUser,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { analyticsService, EventCategory } from '../../services/analytics';
import { useTranslation } from '../../services/localization';
import GlobalErrorHandler from '../../services/errorHandler';

const SettingsOption = ({ onPress, label, isDestructive = false }) => (
  <TouchableOpacity
    style={[styles.option, isDestructive && styles.destructiveOption]}
    onPress={onPress}
  >
    <Text style={[styles.optionText, isDestructive && styles.destructiveText]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const ProfileSettings = ({ navigation }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const reauthenticate = async () => {
    try {
      // Get current password from user
      const password = await new Promise((resolve, reject) => {
        Alert.prompt(
          t('settings.reauth.title'),
          t('settings.reauth.message'),
          [
            {
              text: t('common.cancel'),
              onPress: () => reject(new Error('Cancelled')),
              style: 'cancel',
            },
            {
              text: t('common.confirm'),
              onPress: resolve,
            },
          ],
          'secure-text'
        );
      });

      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        password
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      return true;
    } catch (error) {
      if (error.message !== 'Cancelled') {
        Alert.alert(
          t('settings.reauth.error'),
          t('settings.reauth.errorMessage')
        );
      }
      return false;
    }
  };

  const handleUpdateEmail = async () => {
    try {
      setLoading(true);
      
      // First reauthenticate
      const authenticated = await reauthenticate();
      if (!authenticated) return;

      // Get new email
      const newEmail = await new Promise((resolve, reject) => {
        Alert.prompt(
          t('settings.email.title'),
          t('settings.email.message'),
          [
            {
              text: t('common.cancel'),
              onPress: () => reject(new Error('Cancelled')),
              style: 'cancel',
            },
            {
              text: t('common.update'),
              onPress: resolve,
            },
          ],
          'plain-text',
          auth.currentUser.email
        );
      });

      await updateEmail(auth.currentUser, newEmail);
      
      analyticsService.logEvent('update_email', {
        category: EventCategory.PROFILE,
      });

      Alert.alert(
        t('settings.email.success'),
        t('settings.email.successMessage')
      );
    } catch (error) {
      if (error.message !== 'Cancelled') {
        GlobalErrorHandler.logNonFatalError(error, {
          feature: 'profile_settings',
          action: 'update_email',
        });
        Alert.alert(
          t('settings.email.error'),
          t('settings.email.errorMessage')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    try {
      setLoading(true);
      
      // First reauthenticate
      const authenticated = await reauthenticate();
      if (!authenticated) return;

      // Get new password
      const newPassword = await new Promise((resolve, reject) => {
        Alert.prompt(
          t('settings.password.title'),
          t('settings.password.message'),
          [
            {
              text: t('common.cancel'),
              onPress: () => reject(new Error('Cancelled')),
              style: 'cancel',
            },
            {
              text: t('common.update'),
              onPress: resolve,
            },
          ],
          'secure-text'
        );
      });

      await updatePassword(auth.currentUser, newPassword);
      
      analyticsService.logEvent('update_password', {
        category: EventCategory.PROFILE,
      });

      Alert.alert(
        t('settings.password.success'),
        t('settings.password.successMessage')
      );
    } catch (error) {
      if (error.message !== 'Cancelled') {
        GlobalErrorHandler.logNonFatalError(error, {
          feature: 'profile_settings',
          action: 'update_password',
        });
        Alert.alert(
          t('settings.password.error'),
          t('settings.password.errorMessage')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // Show warning
      const confirmed = await new Promise((resolve) => {
        Alert.alert(
          t('settings.delete.title'),
          t('settings.delete.message'),
          [
            {
              text: t('common.cancel'),
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: t('settings.delete.confirm'),
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ]
        );
      });

      if (!confirmed) return;

      setLoading(true);
      
      // Reauthenticate before deletion
      const authenticated = await reauthenticate();
      if (!authenticated) return;

      // Log analytics before deletion
      analyticsService.logEvent('delete_account', {
        category: EventCategory.PROFILE,
      });

      // Delete the user
      await deleteUser(auth.currentUser);

      Alert.alert(
        t('settings.delete.success'),
        t('settings.delete.successMessage')
      );
    } catch (error) {
      if (error.message !== 'Cancelled') {
        GlobalErrorHandler.logNonFatalError(error, {
          feature: 'profile_settings',
          action: 'delete_account',
        });
        Alert.alert(
          t('settings.delete.error'),
          t('settings.delete.errorMessage')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut(auth);
      await analyticsService.logEvent(EventName.LOGOUT, {
        category: EventCategory.AUTH,
        method: 'manual'
      });
    } catch (error) {
      GlobalErrorHandler.logNonFatalError(error, {
        feature: 'profile_settings',
        action: 'sign_out',
      });
      Alert.alert(
        t('settings.signOut.error'),
        t('settings.signOut.errorMessage')
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.account.title')}</Text>
        <SettingsOption
          label={t('settings.account.updateEmail')}
          onPress={handleUpdateEmail}
        />
        <SettingsOption
          label={t('settings.account.updatePassword')}
          onPress={handleUpdatePassword}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.danger.title')}</Text>
        <SettingsOption
          label={t('settings.account.signOut')}
          onPress={handleSignOut}
          isDestructive
        />
        <SettingsOption
          label={t('settings.account.deleteAccount')}
          onPress={handleDeleteAccount}
          isDestructive
        />
      </View>

      <Text style={styles.version}>
        {t('settings.version', { version: process.env.APP_VERSION || '1.0.0' })}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  section: {
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  option: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  destructiveOption: {
    backgroundColor: '#2C1616',
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
  },
  destructiveText: {
    color: '#FF453A',
  },
  version: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 24,
  },
});

export default ProfileSettings;
