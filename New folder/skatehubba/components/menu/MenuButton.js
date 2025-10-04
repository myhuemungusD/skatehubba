import React from 'react';
import { Pressable, Text, Animated } from 'react-native';
import { useFonts } from 'expo-font';

export function MenuButton({ label, onPress, style }) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 40,
      friction: 7,
      useNativeDriver: true,
    }).start();
  };

  const [fontsLoaded] = useFonts({
    'PressStart2P': require('../../assets/fonts/PressStart2P-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: scaleAnim }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 5,
        },
        style,
      ]}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={({ pressed }) => [
          {
            backgroundColor: pressed ? '#FF5722' : '#FF7043',
            borderWidth: 3,
            borderColor: '#FBE9E7',
            borderRadius: 8,
            padding: 16,
            minWidth: 150,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
        android_ripple={{ color: '#BF360C' }}
      >
        <Text
          style={{
            color: '#FFF',
            fontSize: 18,
            fontFamily: 'PressStart2P',
            textShadowColor: '#000',
            textShadowOffset: { width: 2, height: 2 },
            textShadowRadius: 1,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
