import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';

export default function JoinSessionScreen({ route, navigation }) {
  const { sessionId } = route.params;

  const handleJoinSession = () => {
    Alert.alert(
      'Join Session',
      `Are you sure you want to join session ${sessionId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Join', 
          onPress: () => {
            // TODO: Implement actual join logic
            Alert.alert('Success', 'You have joined the session!');
            navigation.goBack();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Live Session</Text>
      <Text style={styles.sessionId}>Session ID: {sessionId}</Text>
      
      {/* TODO: Add session details, rules, and preparation features */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Session Info</Text>
        <Text style={styles.infoText}>
          📍 Location: TBD
        </Text>
        <Text style={styles.infoText}>
          👥 Current Skaters: TBD
        </Text>
        <Text style={styles.infoText}>
          🎯 Session Type: TBD
        </Text>
        <Text style={styles.infoText}>
          ⏰ Duration: TBD
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.joinButton}
          onPress={handleJoinSession}
        >
          <Text style={styles.joinButtonText}>Join Session</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181b1e',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFD600',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sessionId: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 30,
  },
  infoCard: {
    backgroundColor: '#242a2f',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    width: '100%',
  },
  infoTitle: {
    color: '#FFD600',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  infoText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 15,
  },
  joinButton: {
    backgroundColor: '#FFD600',
    borderRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 18,
  },
  backButton: {
    backgroundColor: '#242a2f',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
