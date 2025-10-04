// Example: How to use ChallengeModal in your screens

import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import ChallengeModal from '../components/challenge/ChallengeModal';
import { irlDigitalService } from '../services/irlDigitalIntegrationService';

export default function ExampleUsageScreen() {
  // 1. STATE SETUP
  const [challengeModal, setChallengeModal] = useState({ 
    open: false, 
    skater: null 
  });

  // 2. MOCK SKATER DATA (replace with real data from your API)
  const mockSkater = {
    id: 'skater_123',
    username: 'TonyHawk',
    avatarUrl: 'https://example.com/avatar.jpg',
    level: 15,
    location: 'Venice Beach'
  };

  // 3. CHALLENGE SENDING FUNCTION
  const sendChallengeAPI = async (challengeData) => {
    try {
      console.log('Sending challenge:', challengeData);
      
      // Use the IRL Digital Integration Service
      const result = await irlDigitalService.sendChallenge(challengeData);
      
      if (result.success) {
        console.log('Challenge sent successfully!', result.challengeId);
      }
    } catch (error) {
      console.error('Failed to send challenge:', error);
      throw error; // Re-throw so the modal can show error
    }
  };

  // 4. OPEN MODAL FUNCTION
  const openChallengeModal = (skater) => {
    setChallengeModal({ open: true, skater });
  };

  // 5. CLOSE MODAL FUNCTION
  const closeChallengeModal = () => {
    setChallengeModal({ open: false, skater: null });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Challenge Modal Example</Text>
      
      {/* Button to open challenge modal */}
      <TouchableOpacity 
        style={styles.challengeButton}
        onPress={() => openChallengeModal(mockSkater)}
      >
        <Text style={styles.buttonText}>Challenge TonyHawk</Text>
      </TouchableOpacity>

      {/* The Challenge Modal */}
      <ChallengeModal
        visible={challengeModal.open}
        skater={challengeModal.skater}
        onSend={sendChallengeAPI}
        onClose={closeChallengeModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#23262b'
  },
  title: {
    fontSize: 24,
    color: '#FFD600',
    fontWeight: 'bold',
    marginBottom: 30
  },
  challengeButton: {
    backgroundColor: '#FFD600',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    shadowColor: '#FFD600',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  buttonText: {
    color: '#23262b',
    fontSize: 18,
    fontWeight: 'bold'
  }
});

/*
INTEGRATION STEPS:

1. Import the ChallengeModal component:
   import ChallengeModal from '../components/challenge/ChallengeModal';

2. Import the IRL service for sending challenges:
   import { irlDigitalService } from '../services/irlDigitalIntegrationService';

3. Add state for modal control:
   const [challengeModal, setChallengeModal] = useState({ open: false, skater: null });

4. Create challenge sending function:
   const sendChallengeAPI = async (challengeData) => {
     const result = await irlDigitalService.sendChallenge(challengeData);
     return result;
   };

5. Add the modal to your JSX:
   <ChallengeModal
     visible={challengeModal.open}
     skater={challengeModal.skater}
     onSend={sendChallengeAPI}
     onClose={() => setChallengeModal({ open: false, skater: null })}
   />

6. Open the modal from buttons/lists:
   onPress={() => setChallengeModal({ open: true, skater: skaterData })}

CHALLENGE DATA STRUCTURE:
{
  skater: {
    id: 'unique_user_id',
    username: 'skatername',
    avatarUrl: 'https://...',
    level: 15
  },
  gameType: 'skate', // 'skate', 'line', or 'custom'
  message: 'Optional hype message',
  timestamp: '2025-07-18T...'
}
*/
