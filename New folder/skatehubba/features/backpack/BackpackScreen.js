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

export default function BackpackScreen({ navigation }) {
  const handleTopPress = () => {
    console.log('TOP button pressed');
    // Navigate to top clothing selection
  };

  const handleBottomPress = () => {
    console.log('BOTTOM button pressed');
    // Navigate to bottom clothing selection
  };

  const handleSkatehubbaPress = () => {
    console.log('SKATEHUBBA button pressed');
    // Navigate to skatehubba gear
  };

  const handleEquipPress = () => {
    console.log('EQUIP button pressed');
    // Navigate to equipment selection
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContainer}>
        {/* SKATER AVATAR */}
        <View style={styles.avatarContainer}>
          <Image
            source={skaterImg}
            style={styles.skaterImage}
          />
        </View>

        {/* LEFT BUTTONS */}
        <View style={styles.leftButtonsContainer}>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={handleTopPress}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>TOP</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.leftButton}
            onPress={handleBottomPress}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>BOTTOM</Text>
          </TouchableOpacity>
        </View>

        {/* RIGHT BUTTONS */}
        <View style={styles.rightButtonsContainer}>
          <TouchableOpacity 
            style={styles.rightButton}
            onPress={handleSkatehubbaPress}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>SKATEHUBBA</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.rightButton}
            onPress={handleEquipPress}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>EQUIP</Text>
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
    top: '40%',
  },
  leftButton: {
    marginBottom: 16,
    backgroundColor: '#171914',
    borderWidth: 2,
    borderColor: '#ffba26',
    borderRadius: 8,
    width: 128,
    paddingVertical: 12,
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
  rightButtonsContainer: {
    position: 'absolute',
    right: 20,
    top: '40%',
  },
  rightButton: {
    marginBottom: 16,
    backgroundColor: '#171914',
    borderWidth: 2,
    borderColor: '#ffba26',
    borderRadius: 8,
    width: 160,
    paddingVertical: 12,
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
    fontSize: 20,
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
