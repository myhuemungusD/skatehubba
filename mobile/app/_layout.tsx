import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import FlashMessage from "react-native-flash-message";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { useAuthListener } from "@/hooks/useAuthListener";
import { useAuthStore } from "@/store/authStore";

export default function RootLayout() {
  const { user, isInitialized } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useAuthListener();

  // Gate routing until auth is initialized
  if (!isInitialized) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0a0a0a",
        }}
      >
        <ActivityIndicator size="large" color="#ff6600" />
      </View>
    );
  }

  // Only redirect logged-in users away from auth screens
  // Allow guests to browse the app freely
  useEffect(() => {
    if (!isInitialized) return;
    const inAuthGroup = segments[0] === "auth";
    // If user is logged in and on auth screen, redirect to home
    if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isInitialized, segments, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0a0a0a" },
          headerTintColor: "#ff6600",
          headerTitleStyle: { fontWeight: "bold" },
          contentStyle: { backgroundColor: "#0a0a0a" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/sign-in" options={{ title: "Sign In", headerShown: false }} />
        <Stack.Screen name="challenge/new" options={{ title: "New Challenge" }} />
        <Stack.Screen name="profile/[uid]" options={{ title: "Profile" }} />
      </Stack>
      <FlashMessage position="top" />
    </QueryClientProvider>
  );
}
