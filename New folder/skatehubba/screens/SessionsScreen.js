import { StyleSheet, Text, View } from 'react-native';

export default function SessionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sessions</Text>
      <Text style={styles.subtitle}>Join skate sessions near you</Text>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD600',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
});
