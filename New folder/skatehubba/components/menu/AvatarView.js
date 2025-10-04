import React, { useEffect } from 'react';
import { View, Image, Animated, Easing } from 'react-native';

export function AvatarView({ style }) {
  const bounceAnim = React.useRef(new Animated.Value(0)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous subtle bounce animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sine),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <Animated.View
      style={[
        {
          transform: [
            {
              translateY: bounceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -10],
              }),
            },
            { rotate: rotation },
          ],
        },
        style,
      ]}
    >
      <Image
        source={require('../../assets/images/skater-avatar.png')}
        style={{
          width: 200,
          height: 200,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}
