import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Image, TextInput, Alert } from "react-native";
import { FontAwesome5 } from '@expo/vector-icons';

const GAME_TYPES = [
  { 
    id: "skate", 
    label: "Game of SKATE",
    description: "Letter-based elimination game",
    icon: "skating"
  },
  { 
    id: "line", 
    label: "Best Line",
    description: "Best trick sequence wins",
    icon: "route"
  },
  { 
    id: "custom", 
    label: "Custom Challenge",
    description: "Create your own rules",
    icon: "cog"
  }
];

export default function ChallengeModal({ visible, skater, onSend, onClose }) {
  const [gameType, setGameType] = useState("skate");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendChallenge = async () => {
    if (!skater) return;
    
    setIsLoading(true);
    
    try {
      await onSend({ 
        skater, 
        gameType, 
        message: message.trim() || "Let's skate!",
        timestamp: new Date().toISOString()
      });
      
      Alert.alert(
        "Challenge Sent! 🛹",
        `Your ${GAME_TYPES.find(t => t.id === gameType)?.label} challenge has been sent to ${skater.username}`,
        [{ text: "Nice!", style: "default" }]
      );
      
      onClose();
      setMessage("");
      setGameType("skate");
    } catch (error) {
      Alert.alert(
        "Challenge Failed",
        "Something went wrong sending your challenge. Try again!",
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!skater) return null;

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="slide" 
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <FontAwesome5 name="fist-raised" size={24} color="#FFD600" />
            <Text style={styles.title}>Send Challenge</Text>
          </View>
          
          {/* Skater Info */}
          <View style={styles.skaterRow}>
            <Image source={{ uri: skater.avatarUrl }} style={styles.avatar} />
            <View style={styles.skaterInfo}>
              <Text style={styles.username}>{skater.username}</Text>
              <Text style={styles.level}>Level {skater.level}</Text>
            </View>
          </View>
          
          {/* Game Type Selection */}
          <Text style={styles.label}>Choose Challenge Type:</Text>
          <View style={styles.typeContainer}>
            {GAME_TYPES.map(type => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeBtn,
                  gameType === type.id && styles.selectedType
                ]}
                onPress={() => setGameType(type.id)}
                activeOpacity={0.8}
              >
                <FontAwesome5 
                  name={type.icon} 
                  size={16} 
                  color={gameType === type.id ? "#181b1e" : "#FFD600"}
                  style={styles.typeIcon}
                />
                <Text style={[
                  styles.typeLabel,
                  { color: gameType === type.id ? "#181b1e" : "#FFD600" }
                ]}>
                  {type.label}
                </Text>
                <Text style={[
                  styles.typeDescription,
                  { color: gameType === type.id ? "#444" : "#AAA" }
                ]}>
                  {type.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Message Input */}
          <TextInput
            placeholder="Add a hype message (optional)"
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholderTextColor="#AAA"
            maxLength={100}
            multiline
          />
          
          {/* Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={onClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.sendBtn, isLoading && styles.disabledBtn]}
              onPress={handleSendChallenge}
              disabled={isLoading}
            >
              {isLoading ? (
                <Text style={styles.sendText}>Sending...</Text>
              ) : (
                <>
                  <FontAwesome5 name="paper-plane" size={16} color="#181b1e" />
                  <Text style={styles.sendText}>Send Challenge</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(20,22,25,0.92)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20
  },
  modal: {
    backgroundColor: "#23262b",
    borderRadius: 20,
    width: "100%",
    maxWidth: 350,
    padding: 24,
    alignItems: "center",
    shadowColor: "#FFD600",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20
  },
  title: {
    fontSize: 22,
    color: "#FFD600",
    fontWeight: "bold",
    marginLeft: 10
  },
  skaterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1d22",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    width: "100%"
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#FFD600"
  },
  skaterInfo: {
    flex: 1
  },
  username: {
    fontSize: 18,
    color: "#FFF",
    fontWeight: "bold"
  },
  level: {
    fontSize: 14,
    color: "#FFD600",
    marginTop: 2
  },
  label: {
    alignSelf: "flex-start",
    color: "#FFD600",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12
  },
  typeContainer: {
    width: "100%",
    marginBottom: 20
  },
  typeBtn: {
    backgroundColor: "#1a1d22",
    borderWidth: 2,
    borderColor: "#FFD600",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    alignItems: "center"
  },
  selectedType: {
    backgroundColor: "#FFD600",
    borderColor: "#FFD600"
  },
  typeIcon: {
    marginBottom: 6
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4
  },
  typeDescription: {
    fontSize: 12,
    textAlign: "center"
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#FFD600",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    color: "#FFF",
    backgroundColor: "#1a1d22",
    fontSize: 16,
    minHeight: 60,
    textAlignVertical: "top"
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12
  },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD600",
    alignItems: "center"
  },
  cancelText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 16
  },
  sendBtn: {
    flex: 2,
    backgroundColor: "#FFD600",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8
  },
  disabledBtn: {
    backgroundColor: "#999",
    opacity: 0.6
  },
  sendText: {
    color: "#181b1e",
    fontWeight: "bold",
    fontSize: 16
  }
});
