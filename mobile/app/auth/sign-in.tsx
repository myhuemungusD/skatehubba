// app/auth/sign-in.tsx
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  type AuthError,
} from "firebase/auth";
import { auth } from "../../src/lib/firebase.config";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "sign-in" | "sign-up";

export default function SignIn() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  const getAuthErrorMessage = (error: unknown): string => {
    const authError = error as Partial<AuthError>;
    switch (authError.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-email":
        return "Invalid email or password.";
      case "auth/email-already-in-use":
        return "An account with this email already exists. Try signing in instead.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again in a few minutes.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      default:
        return "Something went wrong. Please try again.";
    }
  };

  // Listen for Native Google Response
  useEffect(() => {
    if (!response) return;

    if (response.type === "success") {
      const idToken = response.params.id_token ?? response.authentication?.idToken;
      if (!idToken) {
        Alert.alert("Login Failed", "Google sign-in did not return an ID token.");
        setLoading(false);
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken);

      setLoading(true);
      signInWithCredential(auth, credential)
        .catch((error: unknown) => {
          if (__DEV__) {
            console.error("Mobile Google Sign-In Error:", error);
          }
          Alert.alert("Login Failed", getAuthErrorMessage(error));
        })
        .finally(() => {
          setLoading(false);
        });
      return;
    }

    if (response.type === "cancel" || response.type === "dismiss") {
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [response]);

  const handleEmailSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
    } catch (error: unknown) {
      Alert.alert("Sign In Failed", getAuthErrorMessage(error));
      if (__DEV__) {
        console.error("Email Sign-In Error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const trimmedName = displayName.trim();

    if (!normalizedEmail || !normalizedPassword) {
      Alert.alert("Error", "Please enter both email and password.");
      return;
    }

    if (normalizedPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    if (normalizedPassword !== confirmPassword.trim()) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    if (!trimmedName) {
      Alert.alert("Error", "Please enter your skater name.");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        normalizedPassword
      );
      await updateProfile(userCredential.user, { displayName: trimmedName });
    } catch (error: unknown) {
      Alert.alert("Sign Up Failed", getAuthErrorMessage(error));
      if (__DEV__) {
        console.error("Email Sign-Up Error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert(
        "Reset Password",
        "Enter your email address above, then tap 'Forgot password?' again."
      );
      return;
    }

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      Alert.alert(
        "Check Your Email",
        `If an account exists for ${normalizedEmail}, we've sent a password reset link. Check your inbox and spam folder.`
      );
    } catch (error: unknown) {
      const authError = error as Partial<AuthError>;
      if (authError.code === "auth/invalid-email") {
        Alert.alert("Error", "Please enter a valid email address.");
      } else {
        // Don't reveal whether the email exists for security
        Alert.alert(
          "Check Your Email",
          `If an account exists for ${normalizedEmail}, we've sent a password reset link.`
        );
      }
    }
  };

  const handleGooglePress = async () => {
    setLoading(true);
    if (Platform.OS === "web") {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } catch (error: unknown) {
        if (__DEV__) {
          console.error("Web Google Sign-In Error:", error);
        }
        Alert.alert("Login Failed", getAuthErrorMessage(error));
      } finally {
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
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const isSignUp = mode === "sign-up";

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container} testID="auth-sign-in">
          <View style={styles.header}>
            <Text style={styles.brandTitle}>SkateHubba</Text>
            <Text style={styles.tagline}>Find and share the best skate spots</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, !isSignUp && styles.activeTab]}
                onPress={() => switchMode("sign-in")}
                accessibilityRole="tab"
                accessibilityState={{ selected: !isSignUp }}
              >
                <Text style={!isSignUp ? styles.activeTabText : styles.inactiveTabText}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, isSignUp && styles.activeTab]}
                onPress={() => switchMode("sign-up")}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSignUp }}
              >
                <Text style={isSignUp ? styles.activeTabText : styles.inactiveTabText}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formContent}>
              <Text style={styles.welcomeTitle}>
                {isSignUp ? "Create Account" : "Welcome Back"}
              </Text>
              <Text style={styles.welcomeSub}>
                {isSignUp ? "Join the skate community" : "Sign in to your account to continue"}
              </Text>

              {isSignUp && (
                <>
                  <Text style={styles.label}>Skater Name</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color="#666"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={displayNameRef}
                      style={styles.input}
                      placeholder="Your skater name"
                      placeholderTextColor="#666"
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoCapitalize="words"
                      textContentType="name"
                      autoComplete="name"
                      maxLength={50}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      testID="auth-display-name"
                    />
                  </View>
                </>
              )}

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
                  textContentType="emailAddress"
                  autoComplete="email"
                  maxLength={254}
                  returnKeyType="next"
                  onSubmitEditing={() =>
                    isSignUp && !displayName
                      ? displayNameRef.current?.focus()
                      : passwordRef.current?.focus()
                  }
                  testID="auth-email"
                />
              </View>

              <View style={styles.passwordHeader}>
                <Text style={styles.label}>Password</Text>
                {!isSignUp && (
                  <TouchableOpacity onPress={handleForgotPassword}>
                    <Text style={styles.forgotLink}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder={isSignUp ? "Min. 6 characters" : "Enter password"}
                  placeholderTextColor="#666"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType={isSignUp ? "newPassword" : "password"}
                  autoComplete={isSignUp ? "new-password" : "password"}
                  maxLength={128}
                  returnKeyType={isSignUp ? "next" : "done"}
                  onSubmitEditing={() =>
                    isSignUp ? confirmPasswordRef.current?.focus() : handleEmailSignIn()
                  }
                  testID="auth-password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>

              {isSignUp && (
                <>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color="#666"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={confirmPasswordRef}
                      style={styles.input}
                      placeholder="Re-enter password"
                      placeholderTextColor="#666"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      textContentType="newPassword"
                      autoComplete="new-password"
                      maxLength={128}
                      returnKeyType="done"
                      onSubmitEditing={handleEmailSignUp}
                      testID="auth-confirm-password"
                    />
                  </View>
                </>
              )}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={isSignUp ? handleEmailSignUp : handleEmailSignIn}
                disabled={loading}
                testID="auth-submit"
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isSignUp ? "Create Account" : "Sign In"}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleGooglePress}
                disabled={!request && Platform.OS !== "web"}
              >
                <Ionicons name="logo-google" size={20} color="#FFF" style={{ marginRight: 10 }} />
                <Text style={styles.socialButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {isSignUp && (
                <Text style={styles.termsText}>
                  By creating an account, you agree to our Terms of Service and Privacy Policy.
                </Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
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
  termsText: {
    color: "#71717a",
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 16,
  },
});
