import { StyleSheet, Text, View, Button, Alert } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function AuthScreen() {
  const { signIn } = useAuth();

  const handleSignIn = async () => {
    try {
      await signIn();
      Alert.alert('Success', 'Signed in successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign in');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛹 SkateHubba</Text>
      <Text style={styles.subtitle}>Welcome to the ultimate skate community!</Text>
      <Text style={styles.description}>
        Connect with skaters, join sessions, and level up your tricks
      </Text>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="Sign In (Demo)" 
          onPress={handleSignIn}
          color="#FFD600"
        />
      </View>
      
      <Text style={styles.note}>
        This is a demo version. Tap "Sign In" to explore the app!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181b1e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD600',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 20,
  },
  note: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
