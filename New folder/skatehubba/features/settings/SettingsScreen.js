import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';

// Replace this with your actual skater image asset
const skaterImg = require('../../assets/images/skater-avatar.png');

const SettingsScreen = ({ navigation }) => {
  const navigateToScreen = (screenName) => {
    switch (screenName) {
      case 'Sesh':
        navigation.navigate('Sessions');
        break;
      case 'Home':
        navigation.navigate('Home');
        break;
      case 'LiveSesh':
        navigation.navigate('LiveSesh');
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />
      <View style={styles.mainContainer}>
        {/* SKATER AVATAR */}
        <View style={styles.avatarContainer}>
          <Image
            source={skaterImg}
            style={styles.skaterImage}
          />
        </View>

        {/* LEFT MENU OPTIONS */}
        <View style={styles.leftButtonsContainer}>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={() => navigateToScreen('Home')}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>HOME</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={() => navigateToScreen('Sesh')}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>SESH</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={() => navigateToScreen('LiveSesh')}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>LIVE</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={() => navigateToScreen('map')}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>MAP</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={() => navigateToScreen('shop')}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>SHOP</Text>
          </TouchableOpacity>
        </View>

        {/* SKATEHUBBA TITLE */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>SETTINGS</Text>
        </View>

        {/* USER STATS */}
        <View style={styles.inventoryBar}>
          <Text style={styles.inventoryText}>
            LEVEL: <Text style={styles.inventoryCount}>5</Text>
          </Text>
          <Text style={styles.inventoryText}>
            HB: <Text style={styles.inventoryCount}>1,240</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#22282d',
  },
  mainContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 24,
  },
  avatarContainer: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  skaterImage: {
    width: 220,
    height: 340,
    resizeMode: 'contain',
  },
  leftButtonsContainer: {
    position: 'absolute',
    left: 20,
    top: '35%',
  },
  leftButton: {
    marginBottom: 20,
    backgroundColor: '#171914',
    borderWidth: 2,
    borderColor: '#ffba26',
    borderRadius: 8,
    width: 140,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  titleContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ffba26',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 2,
  },
  inventoryBar: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#171914',
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffba26',
  },
  inventoryText: {
    color: '#ffea26',
    fontWeight: '800',
    fontSize: 16,
    marginRight: 16,
  },
  inventoryCount: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
