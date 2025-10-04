import React, { useState } from "react";
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, TextInput, Dimensions, ScrollView } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import NearbySkaters from "../../components/NearbySkaters";
import LiveSessions from "../../components/LiveSessions";
import NewsFeed from "../../components/NewsFeed";
import ChatBar from "../../components/ChatBar";
import ChallengeButton from "../../components/ChallengeButton";

const { width, height } = Dimensions.get("window");

export default function LiveSeshScreen({ navigation }) {
  const [chat, setChat] = useState([
    { id: "1", user: "Mike V.", msg: "Yo anyone down for a game?", you: false },
    { id: "2", user: "You", msg: "Pull up to Hollenbeck!", you: true },
    { id: "3", user: "Lacey B.", msg: "Going live now!", you: false },
  ]);
  const [challengeModal, setChallengeModal] = useState({ open: false, skater: null });

  const handleSendMessage = (message) => {
    const newMessage = {
      id: Date.now().toString(),
      user: "You",
      msg: message,
      you: true
    };
    setChat([...chat, newMessage]);
  };

  const handleChallenge = skater => setChallengeModal({ open: true, skater });

  // Challenge confirm modal would go here in a real app

  return (
    <View style={styles.container}>
      {/* BACKGROUND */}
      <Image source={require("../../assets/images/fake-map-bg.png")} style={styles.bg} />

      {/* TOP BAR */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Live Sesh Lobby</Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate("Map")}>
          <MaterialCommunityIcons name="skateboard" size={34} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>

        {/* CHALLENGE BUTTON */}
        <View style={styles.challengeSection}>
          <Text style={styles.challengeTitle}>Quick Challenge</Text>
          <ChallengeButton 
            onPress={() => handleChallenge({ username: 'Random Skater', uid: 'random' })}
            style={styles.quickChallengeBtn}
          />
        </View>

        {/* NEARBY SKATERS COMPONENT */}
        <NearbySkaters
          onChallenge={skater => handleChallenge(skater)}
          onProfile={skater => navigation.navigate('SkaterProfile', { skaterId: skater.uid })}
        />

        {/* LIVE SESSIONS COMPONENT */}
        <LiveSessions
          onSpectate={session => navigation.navigate('SpectateSession', { sessionId: session.id })}
          onJoin={session => navigation.navigate('JoinSession', { sessionId: session.id })}
        />

        {/* NEWS FEED COMPONENT */}
        <NewsFeed />
      </ScrollView>

      {/* LIVE CHAT WITH NEW CHATBAR COMPONENT */}
      <View style={styles.chatContainer}>
        <FlatList
          data={chat}
          keyExtractor={item => item.id}
          style={styles.chatList}
          renderItem={({ item }) => (
            <View style={[styles.chatMsg, item.you && styles.chatMsgYou]}>
              <Text style={styles.chatUser}>{item.user}:</Text>
              <Text style={styles.chatText}>{item.msg}</Text>
            </View>
          )}
        />
        <ChatBar onSend={handleSendMessage} />
      </View>
      
      {/* TODO: Add ChallengeModal component when challengeModal.open is true */}
      {challengeModal.open && (
        console.log('Challenge modal should open for:', challengeModal.skater?.username)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#16505c" },
  bg: { position: "absolute", width, height, resizeMode: "cover" },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    width: "100%", paddingTop: 48, paddingHorizontal: 18,
  },
  title: { color: "#fff", fontSize: 28, fontWeight: "bold", letterSpacing: 1.5, },
  homeBtn: { backgroundColor: "#222", borderRadius: 24, padding: 6, borderWidth: 2, borderColor: "#FFD600" },
  scrollArea: { flex: 1, paddingTop: 12, },
  challengeSection: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    marginVertical: 10,
    backgroundColor: "rgba(34,34,34,0.8)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 20,
  },
  challengeTitle: { 
    color: "#FFD600", 
    fontSize: 18, 
    fontWeight: "bold", 
    marginRight: 15 
  },
  quickChallengeBtn: {
    marginTop: 0,
    backgroundColor: "#FFD600",
    borderColor: "#222",
  },
  chatContainer: { backgroundColor: "#111c", padding: 8, borderTopLeftRadius: 18, borderTopRightRadius: 18, position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 120, },
  chatList: { maxHeight: 108 },
  chatMsg: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  chatMsgYou: { alignSelf: "flex-end" },
  chatUser: { color: "#FFD600", fontWeight: "bold", marginRight: 6 },
  chatText: { color: "#fff" },
});
