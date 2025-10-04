import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { GAME_TYPES } from '../../constants/gameTypes';

export function GameHypeMessage({ gameType, isSuccess, isTrickLanded }) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [message, setMessage] = useState('');

  useEffect(() => {
    let newMessage = '';
    
    if (isSuccess) {
      if (isTrickLanded) {
        newMessage = '🔥 SICK! You nailed it!';
      } else {
        const encouragements = GAME_TYPES[gameType].encouragements;
        newMessage = encouragements[Math.floor(Math.random() * encouragements.length)];
      }
    } else {
      newMessage = '💪 No stress, shake it off and keep pushing!';
    }

    setMessage(newMessage);
    
    // Animate the message
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isSuccess, isTrickLanded]);

  return (
    <Animated.View 
      style={[
        styles.container,
        { opacity: fadeAnim }
      ]}
    >
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 25,
    marginHorizontal: 20,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
