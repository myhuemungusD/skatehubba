import React, { useState, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from 'expo-location';

const { width, height } = Dimensions.get("window");

export default function MapScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [heading, setHeading] = useState(0);

  // Demo spot data with real GPS coordinates
  const spots = [
    { 
      name: "Hollenbeck Park", 
      latitude: 34.0522, 
      longitude: -118.2437,
      x: 70, 
      y: 220, 
      img: require("../../assets/images/spot-hollenbeck.png") 
    },
    { 
      name: "Hollywood High", 
      latitude: 34.0982, 
      longitude: -118.3467,
      x: 250, 
      y: 130, 
      img: require("../../assets/images/spot-hollywood.png") 
    }
  ];

  useEffect(() => {
    (async () => {
      // Request location permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert(
          'Location Permission',
          'Please enable location permissions to use GPS features',
          [{ text: 'OK' }]
        );
        return;
      }

      // Get current location with high accuracy
      try {
        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        });
        setLocation(currentLocation);

        // Watch position changes for real-time updates
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (newLocation) => {
            setLocation(newLocation);
          }
        );

        // Watch heading changes for compass functionality
        Location.watchHeadingAsync((headingData) => {
          setHeading(headingData.trueHeading || headingData.magHeading);
        });

      } catch (error) {
        setErrorMsg('Error getting location: ' + error.message);
        Alert.alert('GPS Error', 'Unable to get your current location');
      }
    })();
  }, []);

  // Calculate distance between two GPS coordinates
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in km
    return d < 1 ? Math.round(d * 1000) + 'm' : Math.round(d * 10) / 10 + 'km';
  };

  // Get user's current coordinates
  const userLat = location?.coords?.latitude;
  const userLon = location?.coords?.longitude;
  const userSpeed = location?.coords?.speed || 0; // Speed in m/s
  const userAltitude = location?.coords?.altitude || 0;
  const accuracy = location?.coords?.accuracy || 0;

  return (
    <View style={styles.container}>
      {/* Map background */}
      <Image source={require("../../assets/images/fake-map-bg.png")} style={styles.mapBg} />

      {/* GPS INFO OVERLAY */}
      <View style={styles.gpsInfo}>
        <Text style={styles.gpsText}>
          📍 {userLat ? `${userLat.toFixed(6)}, ${userLon.toFixed(6)}` : 'Getting GPS...'}
        </Text>
        <Text style={styles.gpsText}>
          🧭 {heading.toFixed(0)}° | 📏 ±{accuracy.toFixed(0)}m | ⚡ {(userSpeed * 3.6).toFixed(1)} km/h
        </Text>
      </View>

      {/* TOP BAR ICONS */}
      <View style={styles.topBar}>
        {/* Avatar/profile icons */}
        <View style={styles.profileStack}>
          <Image source={require("../../assets/images/avatar1.png")} style={styles.avatar} />
          <Image source={require("../../assets/images/avatar2.png")} style={styles.avatarMini} />
        </View>
        {/* Count badges */}
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {spots.filter(spot => userLat && calculateDistance(userLat, userLon, spot.latitude, spot.longitude).includes('m')).length}
            </Text>
          </View>
        </View>
        {/* Skateboard Home button */}
        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate("Settings")}>
          <MaterialCommunityIcons name="skateboard" size={36} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Map spot pins with distance calculation */}
      {spots.map((spot, i) => {
        const distance = userLat ? calculateDistance(userLat, userLon, spot.latitude, spot.longitude) : '';
        return (
          <TouchableOpacity 
            key={spot.name} 
            style={[styles.spotPin, { left: spot.x, top: spot.y }]}
            onPress={() => Alert.alert(spot.name, `Distance: ${distance}\nCoords: ${spot.latitude}, ${spot.longitude}`)}
          >
            <Image source={spot.img} style={styles.spotImg} />
            <Text style={styles.spotName}>{spot.name}</Text>
            {distance && <Text style={styles.spotDistance}>{distance}</Text>}
          </TouchableOpacity>
        );
      })}

      {/* Skater in center with compass rotation */}
      <View style={[styles.skaterWrap, { transform: [{ rotate: `${heading}deg` }] }]}>
        <Image source={require("../../assets/images/skater-avatar.png")} style={styles.skater} />
        <View style={styles.compassDot} />
      </View>

      {/* BOTTOM BAR BUTTONS */}
      <View style={styles.bottomBar}>
        {/* GPS Status button */}
        <TouchableOpacity 
          style={[styles.iconBtn, { backgroundColor: location ? '#2d5a2d' : '#5a2d2d' }]}
          onPress={() => Alert.alert(
            'GPS Status', 
            `Status: ${location ? 'Connected' : 'Disconnected'}\n` +
            `Accuracy: ±${accuracy.toFixed(0)}m\n` +
            `Speed: ${(userSpeed * 3.6).toFixed(1)} km/h\n` +
            `Altitude: ${userAltitude.toFixed(0)}m`
          )}
        >
          <MaterialCommunityIcons 
            name={location ? "satellite-variant" : "satellite-off"} 
            size={32} 
            color="#fff" 
          />
        </TouchableOpacity>
        
        {/* Record button with GPS recording */}
        <TouchableOpacity 
          style={styles.recordBtn}
          onPress={() => {
            if (location) {
              Alert.alert('Recording Started', `GPS tracking active at ${userLat.toFixed(6)}, ${userLon.toFixed(6)}`);
            } else {
              Alert.alert('GPS Required', 'Please enable GPS to start recording');
            }
          }}
        >
          <View style={styles.recordOuter}>
            <View style={[styles.recordInner, { backgroundColor: location ? '#ff2a2a' : '#666' }]} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#156788" },
  mapBg: {
    position: "absolute",
    width,
    height,
    resizeMode: "cover",
    top: 0, left: 0,
  },
  gpsInfo: {
    position: 'absolute',
    top: 80,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 8,
    zIndex: 1000,
  },
  gpsText: {
    color: '#FFD600',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 42,
    width: "100%",
  },
  profileStack: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 4, borderWidth: 2, borderColor: "#FFC300" },
  avatarMini: { width: 28, height: 28, borderRadius: 14, marginLeft: -16, borderWidth: 1.5, borderColor: "#FFC300" },
  badges: { flexDirection: "row" },
  badge: { backgroundColor: "#222", borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 6, height: 28, justifyContent: "center" },
  badgeText: { color: "#FFD600", fontWeight: "bold", fontSize: 17 },
  homeBtn: { backgroundColor: "#222", borderRadius: 28, padding: 6, borderWidth: 2, borderColor: "#FFD600" },

  spotPin: { position: "absolute", alignItems: "center" },
  spotImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#339", marginBottom: 2 },
  spotName: { color: "#fff", fontSize: 13, fontWeight: "bold", backgroundColor: "rgba(30,30,30,0.7)", paddingHorizontal: 6, borderRadius: 7 },
  spotDistance: { color: "#FFD600", fontSize: 11, fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 4, borderRadius: 4, marginTop: 2 },

  skaterWrap: { position: "absolute", left: width/2-60, top: height/2-140, alignItems: "center" },
  skater: { width: 120, height: 180, resizeMode: "contain" },
  compassDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: '#ff2a2a', 
    position: 'absolute', 
    top: -4 
  },

  bottomBar: {
    position: "absolute",
    bottom: 36,
    left: 0, right: 0,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-end",
  },
  iconBtn: { backgroundColor: "#222", borderRadius: 32, width: 64, height: 64, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFD600" },
  icon: { width: 42, height: 42, resizeMode: "contain" },
  recordBtn: { marginBottom: 0 },
  recordOuter: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#111", justifyContent: "center", alignItems: "center", borderWidth: 4, borderColor: "#FFD600" },
  recordInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ff2a2a" },
});

export default MapScreen;
