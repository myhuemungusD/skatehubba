import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  StatusBar,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const BetaMenuScreen = ({ navigation }) => {
  const navigateToScreen = (screenName) => {
    switch (screenName) {
      case 'Sesh':
        navigation.navigate('Sessions');
        break;
      case 'map':
        navigation.navigate('Map');
        break;
      case 'shop':
        navigation.navigate('BetaShop');
        break;
      default:
        console.log(`Navigation to ${screenName} not implemented yet`);
    }
  };

  const menuItems = [
    { title: 'Sesh', action: () => navigateToScreen('Sesh') },
    { title: 'map', action: () => navigateToScreen('map') },
    { title: 'shop', action: () => navigateToScreen('shop') },
  ];

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <ImageBackground
        source={require('../../assets/images/skatehubba-menu-bg.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* SKATEHUBBA Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>SKATEHUBBA</Text>
        </View>

        {/* Menu Options */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.action}
              activeOpacity={0.8}
            >
              <Text style={styles.menuText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Character and skateboard are part of the background image */}
        {/* Sponsor logos are part of the background image */}
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
  },
  titleContainer: {
    position: 'absolute',
    top: screenHeight * 0.08, // Approximately 8% from top
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: screenWidth * 0.15, // Responsive font size
    fontWeight: '900',
    color: '#FFA500', // Orange/yellow color matching the image
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 2,
    fontFamily: 'System',
  },
  menuContainer: {
    position: 'absolute',
    left: screenWidth * 0.08, // 8% from left edge
    top: screenHeight * 0.35, // Start at 35% from top
    justifyContent: 'space-between',
    height: screenHeight * 0.4, // Spread over 40% of screen height
  },
  menuItem: {
    marginVertical: screenHeight * 0.02,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  menuText: {
    fontSize: screenWidth * 0.12, // Large, bold text like in the image
    fontWeight: '900',
    color: '#FFA500', // Orange/yellow color
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'System',
  },
});

export default BetaMenuScreen;
