import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../../services/localization';
import { useAuth } from '../../context/AuthContext';
import { canAccessScreen } from '../../utils/roles';

const MenuItem = ({ icon, label, onPress, testID }) => (
  <TouchableOpacity
    style={styles.menuItem}
    onPress={onPress}
    accessible={true}
    accessibilityLabel={label}
    accessibilityRole="button"
    testID={testID}
  >
    <Ionicons name={icon} size={24} color="#FFFFFF" style={styles.menuIcon} />
    <Text style={styles.menuText}>{label}</Text>
    <Ionicons name="chevron-forward" size={20} color="#666666" />
  </TouchableOpacity>
);

export default function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { userRole } = useAuth();

  const menuItems = [
    {
      name: 'Lobbies',
      icon: 'game-controller',
      testID: 'menu-lobbies',
    },
    {
      name: 'Checkins',
      icon: 'location',
      testID: 'menu-checkins',
    },
    {
      name: 'Archive',
      icon: 'archive',
      testID: 'menu-archive',
    },
    {
      name: 'Verify',
      icon: 'checkmark-circle',
      testID: 'menu-verify',
    },
    {
      name: 'Admin',
      icon: 'settings',
      testID: 'menu-admin',
    },
  ].filter(item => canAccessScreen(userRole, item.name));

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.content}
      accessible={true}
      accessibilityLabel={t('more.title')}
    >
      {menuItems.map(item => (
        <MenuItem
          key={item.name}
          icon={item.icon}
          label={t(`more.${item.name.toLowerCase()}`)}
          onPress={() => navigation.navigate(item.name)}
          testID={item.testID}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
