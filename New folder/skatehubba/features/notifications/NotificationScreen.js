import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';

const demoNotifications = [
  {
    id: 'notif-1',
    type: 'challenge',
    message: '@olliemama challenged you to a game of S.K.A.T.E.!',
    isNew: true,
    time: '2 min ago',
  },
  {
    id: 'notif-2',
    type: 'session',
    message: 'Bronson Bearings Jam session is starting now.',
    isNew: false,
    time: '20 min ago',
  },
  {
    id: 'notif-3',
    type: 'shop',
    message: '15% off today at Baker Boys Skate Shop. Check in to claim!',
    isNew: true,
    time: '1 hr ago',
  },
  {
    id: 'notif-4',
    type: 'checkin',
    message: '@kickflipkid just checked in at Venice Beach Skatepark!',
    isNew: false,
    time: '2 hr ago',
  },
];

export default function NotificationScreen() {
  const [notifications, setNotifications] = useState(demoNotifications);

  function markAsRead(id) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isNew: false } : n))
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notifCard, item.isNew && styles.newNotif]}
            onPress={() => markAsRead(item.id)}
          >
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.time}>{item.time}</Text>
            {item.isNew && <Text style={styles.newBadge}>NEW</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 22 },
  title: { fontWeight: 'bold', fontSize: 22, marginBottom: 14 },
  notifCard: { backgroundColor: '#f7f7fa', borderRadius: 14, padding: 15, marginBottom: 12, position: 'relative' },
  newNotif: { borderColor: '#4a90e2', borderWidth: 2 },
  message: { fontSize: 15, marginBottom: 2, color: '#222' },
  time: { fontSize: 12, color: '#888' },
  newBadge: { position: 'absolute', top: 10, right: 18, color: '#fff', backgroundColor: '#4a90e2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, fontSize: 11, fontWeight: 'bold' },
});
