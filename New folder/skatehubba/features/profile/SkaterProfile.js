import React from 'react';
import { 
  View, 
  Text, 
  Image, 
  TouchableOpacity, 
  StyleSheet,
  SafeAreaView 
} from 'react-native';

// Replace this with your actual skater image asset
const skaterImg = require('../../assets/images/skater-avatar.png');

export default function SkaterProfile({ navigation }) {
  const handleMapPress = () => {
    console.log('MAP button pressed');
    navigation.navigate('Map');
  };

  const handleSettingsPress = () => {
    console.log('SETTINGS button pressed');
    // Navigate to settings screen with menu
    navigation.navigate('Settings');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContainer}>
        {/* Screen Title (Optional - Top Center) */}
        {/* Uncomment if you want a visible title */}
        {/* 
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>
            SkaterProfile
          </Text>
        </View>
        */}

        {/* SKATER AVATAR */}
        <View style={styles.avatarContainer}>
          <Image
            source={skaterImg}
            style={styles.skaterImage}
          />
        </View>

        {/* CENTERED BUTTONS */}
        <View style={styles.centeredButtonsContainer}>
          <TouchableOpacity 
            style={styles.centeredButton}
            onPress={handleMapPress}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>MAP</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.centeredButton}
            onPress={handleSettingsPress}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>SETTINGS</Text>
          </TouchableOpacity>
        </View>

        {/* INVENTORY BAR */}
        <View style={styles.inventoryBar}>
          <Text style={styles.inventoryText}>
            HARDWARE: <Text style={styles.inventoryCount}>× 24</Text>
          </Text>
          <Text style={styles.inventoryText}>
            BEARINGS: <Text style={styles.inventoryCount}>× 16</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

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
  titleContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  titleText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
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
  centeredButtonsContainer: {
    width: '100%',
    alignItems: 'center',
    position: 'absolute',
    bottom: 144, // bottom-36 equivalent
  },
  centeredButton: {
    marginBottom: 16,
    backgroundColor: '#171914',
    borderWidth: 2,
    borderColor: '#ffba26',
    borderRadius: 8,
    width: 256, // w-64 equivalent
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
    fontSize: 18,
    marginRight: 16,
  },
  inventoryCount: {
    color: 'white',
    fontWeight: 'bold',
  },
});
