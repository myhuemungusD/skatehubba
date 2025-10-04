import React, { useEffect } from 'react';
import {
  View,
  ImageBackground,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  Animated,
} from 'react-native';
import { MenuButton } from './MenuButton';
import { AvatarView } from './AvatarView';
import { InventoryStatus } from './InventoryStatus';

export function MainMenuScreen() {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require('../../assets/images/graffiti-wall.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          {/* Left side buttons */}
          <View style={styles.leftButtons}>
            <MenuButton label="TOP" onPress={() => {}} style={styles.button} />
            <MenuButton label="BOTTOM" onPress={() => {}} style={styles.button} />
            <MenuButton label="DECK" onPress={() => {}} style={styles.button} />
          </View>

          {/* Center avatar */}
          <AvatarView style={styles.avatar} />

          {/* Right side buttons */}
          <View style={styles.rightButtons}>
            <MenuButton
              label="SKATEHUBBA"
              onPress={() => {}}
              style={styles.button}
            />
            <MenuButton label="EQUIP" onPress={() => {}} style={styles.button} />
          </View>

          {/* Inventory status */}
          <View style={styles.inventory}>
            <InventoryStatus hardware={24} bearings={16} />
          </View>
        </Animated.View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  background: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1A1A1A',
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    padding: 20,
  },
  leftButtons: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 20,
  },
  rightButtons: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 20,
  },
  button: {
    marginVertical: 8,
  },
  avatar: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -100 }, { translateY: -100 }],
  },
  inventory: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },
});
