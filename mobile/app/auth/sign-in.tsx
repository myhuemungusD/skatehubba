// app/auth/sign-in.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
} from "firebase/auth";
import { auth } from "../../src/lib/firebase.config";

// 1. Mobile Browser Handler (Required for Expo Go / Native)
WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2. Google Auth Request Hook (The Native Strategy)
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  // 3. Listen for Native Google Response
  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);

      setLoading(true);
      signInWithCredential(auth, credential).catch((error) => {
        console.error("Mobile Google Sign-In Error:", error);
        Alert.alert("Login Failed", error.message);
        setLoading(false);
      });
      // Success is handled by the Global Store Listener (redirects automatically)
    }
  }, [response]);

  // 4. Handle Email Sign In
  const handleEmailSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      let msg = "Something went wrong.";
      if (error.code === "auth/invalid-credential") msg = "Invalid email or password.";
      Alert.alert("Sign In Failed", msg);
      setLoading(false);
    }
  };

  // 5. Handle Google Button Press (Forked Logic)
  const handleGooglePress = async () => {
    setLoading(true);
    if (Platform.OS === "web") {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } catch (error: any) {
        console.error(error);
        setLoading(false);
      }
    } else {
      if (
        !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
        !process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
      ) {
        Alert.alert("Missing config", "Google client IDs are not configured.");
        setLoading(false);
        return;
      }
      await promptAsync();
      // Note: setLoading(false) happens if the user cancels the modal
    }
  };

  return (
    <View style={styles.container} testID="auth-sign-in">
      <View style={styles.header}>
        <Text style={styles.brandTitle}>SkateHubba</Text>
        <Text style={styles.tagline}>Find and share the best skate spots</Text>
      </View>

      <View style={styles.card}>
        {/* ... Tab Logic Same as Before ... */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, styles.activeTab]}>
            <Text style={styles.activeTabText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} disabled>
            <Text style={styles.inactiveTabText}>Sign Up (Soon)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formContent}>
          <Text style={styles.welcomeTitle}>Welcome Back</Text>
          <Text style={styles.welcomeSub}>Sign in to your account to continue</Text>

          {/* Inputs */}
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="auth-email"
            />
          </View>

          <View style={styles.passwordHeader}>
            <Text style={styles.label}>Password</Text>
            <Text style={styles.forgotLink}>Forgot password?</Text>
          </View>
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              testID="auth-password"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {/* Button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleEmailSignIn}
            disabled={loading}
            testID="auth-submit"
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Button - Connected to Forked Logic */}
          <TouchableOpacity
            style={styles.socialButton}
            onPress={handleGooglePress}
            disabled={!request && Platform.OS !== "web"}
          >
            <Ionicons name="logo-google" size={20} color="#FFF" style={{ marginRight: 10 }} />
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ... Styles remain exactly the same as previous response ...
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  header: { alignItems: "center", marginBottom: 40 },
  brandTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: -1,
    fontStyle: "italic",
  },
  tagline: { color: "#a1a1aa", marginTop: 8, fontSize: 14 },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 4,
    overflow: "hidden",
  },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#27272a" },
  tab: { flex: 1, paddingVertical: 16, alignItems: "center" },
  activeTab: { borderBottomWidth: 2, borderBottomColor: "#FF6600", backgroundColor: "#27272a" },
  activeTabText: { color: "#FF6600", fontWeight: "bold" },
  inactiveTabText: { color: "#71717a", fontWeight: "600" },
  formContent: { padding: 24 },
  welcomeTitle: { fontSize: 20, fontWeight: "bold", color: "#FFF", marginBottom: 8 },
  welcomeSub: { fontSize: 14, color: "#a1a1aa", marginBottom: 24 },
  label: { fontSize: 12, fontWeight: "600", color: "#d4d4d8", marginBottom: 8 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 4,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: "#FFF", height: "100%" },
  passwordHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  forgotLink: { fontSize: 12, color: "#FF6600" },
  primaryButton: {
    backgroundColor: "#FF6600",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
  },
  primaryButtonText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  dividerContainer: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#3f3f46" },
  dividerText: { marginHorizontal: 12, color: "#71717a", fontSize: 10, fontWeight: "bold" },
  socialButton: {
    flexDirection: "row",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#3f3f46",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
  },
  socialButtonText: { color: "#FFF", fontWeight: "600" },
});
