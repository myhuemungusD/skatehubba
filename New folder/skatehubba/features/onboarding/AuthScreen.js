import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform 
} from 'react-native';
import { signIn, signUp } from '../../services/auth';
import { useAuth } from '../../context/AuthContext';

export default function AuthScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const validateForm = () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return false;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      return false;
    }
    if (mode === 'signup' && !username.trim()) {
      setError('Please enter a username');
      return false;
    }
    return true;
  };

  async function handleAuth() {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const result = mode === 'signup'
        ? await signUp(email, password, username)
        : await signIn(email, password);

      if (!result.success) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      // Clear form and navigate on success
      setEmail('');
      setPassword('');
      setUsername('');
      navigation.replace('Main');
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.form}>
        <Text style={styles.title}>
          {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
        </Text>

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {mode === 'signup' && (
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="Username"
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              setError(null);
            }}
            autoCapitalize="none"
            editable={!loading}
          />
        )}

        <TextInput
          style={[styles.input, error && styles.inputError]}
          placeholder="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading}
        />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title={mode === 'signup' ? 'Sign Up' : 'Log In'} onPress={handleAuth} disabled={loading} />
      <Text style={styles.switch} onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        {mode === 'signup' ? 'Already have an account? Log In' : 'New user? Sign Up'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 12 },
  input: { width: '100%', height: 44, borderColor: '#ddd', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginBottom: 10 },
  switch: { color: '#4a90e2', marginTop: 16, textDecorationLine: 'underline', fontSize: 15 },
});
