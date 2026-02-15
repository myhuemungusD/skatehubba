import { Stack } from "expo-router";

export default function DemoLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0a0a0a" },
        headerTintColor: "#ff6600",
        headerTitleStyle: { fontWeight: "bold" },
        contentStyle: { backgroundColor: "#0a0a0a" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Investor Demo", headerShown: false }}
      />
      <Stack.Screen
        name="battle"
        options={{ title: "S.K.A.T.E. Battle", headerShown: false }}
      />
      <Stack.Screen
        name="judging"
        options={{ title: "Judging Phase", headerShown: false }}
      />
      <Stack.Screen
        name="result"
        options={{ title: "Battle Result", headerShown: false }}
      />
      <Stack.Screen
        name="lobby"
        options={{ title: "Game Lobby" }}
      />
      <Stack.Screen
        name="leaderboard"
        options={{ title: "Leaderboard" }}
      />
      <Stack.Screen
        name="profile"
        options={{ title: "Player Profile" }}
      />
    </Stack>
  );
}
