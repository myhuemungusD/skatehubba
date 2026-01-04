import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import FlashMessage from 'react-native-flash-message';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#ff6600',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0a0a0a' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/signin" options={{ title: 'Sign In', headerShown: false }} />
        <Stack.Screen name="challenge/new" options={{ title: 'New Challenge' }} />
        <Stack.Screen name="profile/[uid]" options={{ title: 'Profile' }} />
      </Stack>
      <FlashMessage position="top" />
    </QueryClientProvider>
  );
}
