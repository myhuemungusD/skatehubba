import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ChatBar({ onSend }) {
  const [msg, setMsg] = useState("");

  const handleSend = () => {
    if (msg.trim().length === 0) return;
    onSend(msg.trim());
    setMsg("");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#AAA"
          value={msg}
          onChangeText={setMsg}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline={false}
          maxLength={500}
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendBtn}>
          <Ionicons name="send" size={24} color="#FFD600" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#222",
    padding: 8, 
    borderTopWidth: 1, 
    borderColor: "#333",
    position: "absolute", 
    left: 0, 
    right: 0, 
    bottom: 0, 
    zIndex: 100,
  },
  input: {
    flex: 1, 
    color: "#fff", 
    padding: 10, 
    borderRadius: 20,
    backgroundColor: "#242a2f", 
    marginRight: 10, 
    fontSize: 16
  },
  sendBtn: {
    padding: 7, 
    borderRadius: 22, 
    backgroundColor: "#23262b",
    alignItems: "center", 
    justifyContent: "center"
  }
});
