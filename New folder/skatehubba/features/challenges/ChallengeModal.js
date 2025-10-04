import React from 'react';
import { View, Modal, StyleSheet } from 'react-native';
import { ChallengeActions } from './ChallengeActions';

export function ChallengeModal({ visible, targetUser, onClose, onCreateChallenge }) {
  const [selectedGameType, setSelectedGameType] = useState('SKATE');
  const [loading, setLoading] = useState(false);

  const handleCreateChallenge = async () => {
    setLoading(true);
    try {
      await createChallenge({
        targetUserId: targetUser.id,
        gameType: selectedGameType,
        status: 'pending',
      });
      onClose();
    } catch (error) {
      console.error('Error creating challenge:', error);
      Alert.alert('Error', 'Failed to create challenge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>🛹 Challenge Time!</Text>
          <Text style={styles.subtitle}>Ready to battle {targetUser.username}?</Text>
          
          <Text style={styles.sectionTitle}>Pick Your Game, Homie!</Text>
          
          {Object.entries(GAME_TYPES).map(([type, data]) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.gameTypeButton,
                selectedGameType === type && styles.selectedGameType
              ]}
              onPress={() => setSelectedGameType(type)}
            >
              <View style={styles.gameTypeHeader}>
                <Text style={styles.gameTypeName}>{data.name}</Text>
                {selectedGameType === type && (
                  <Icon name="fire" size={24} color="#FF5722" />
                )}
              </View>
              <Text style={styles.gameTypeDescription}>{data.description}</Text>
              <Text style={styles.gameTypeHype}>{data.hypeText}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.createButton, loading && styles.buttonDisabled]}
              onPress={handleCreateChallenge}
              disabled={loading}
            >
              <Text style={styles.createButtonText}>
                {loading ? 'Creating...' : 'Send Challenge'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
});