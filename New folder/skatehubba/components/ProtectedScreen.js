import React from 'react';
import { View, Text } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { canAccessScreen } from '../utils/roles';

export const ProtectedScreen = ({ name, component: Component, ...props }) => {
  const { userRole, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    // Handle unauthenticated state
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Please log in to access this feature.</Text>
      </View>
    );
  }

  if (!canAccessScreen(userRole, name)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>You don't have permission to access this feature.</Text>
      </View>
    );
  }

  return <Component {...props} />;
};
