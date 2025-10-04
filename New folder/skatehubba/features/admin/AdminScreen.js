import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';

const demoVerifications = [
  { id: 'v-1', type: 'pro', user: 'kickflipkid', brand: 'Baker', reason: 'Pro for Baker since 2023' },
  { id: 'v-2', type: 'shop', user: 'shop-berrics', brand: 'The Berrics', reason: 'Official Berrics account' },
  { id: 'v-3', type: 'flow', user: 'olliemama', brand: 'Bronson', reason: 'Flow for Bronson' },
];

export default function AdminScreen() {
  const [verifications, setVerifications] = useState(demoVerifications);

  function handleApprove(id) {
    setVerifications(prev => prev.filter(v => v.id !== id));
    Alert.alert('Approved', 'Verification approved.');
  }

  function handleDeny(id) {
    setVerifications(prev => prev.filter(v => v.id !== id));
    Alert.alert('Denied', 'Verification denied.');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.subtitle}>Pending Verification Requests</Text>
      <FlatList
        data={verifications}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.requestCard}>
            <Text style={styles.reqText}>
              @{item.user} - {item.type.toUpperCase()} for {item.brand}
            </Text>
            <Text style={styles.reason}>{item.reason}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item.id)}>
                <Text style={styles.actionText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.denyBtn} onPress={() => handleDeny(item.id)}>
                <Text style={styles.actionText}>Deny</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 24 }}>No pending requests.</Text>}
      />
      {/* Add more admin sections here: user management, reports, etc */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 22 },
  title: { fontWeight: 'bold', fontSize: 22, marginBottom: 8 },
  subtitle: { fontWeight: 'bold', fontSize: 17, marginBottom: 10 },
  requestCard: { backgroundColor: '#f7f7fa', borderRadius: 13, padding: 15, marginBottom: 13 },
  reqText: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  reason: { fontSize: 13, color: '#666', marginBottom: 7 },
  actionRow: { flexDirection: 'row' },
  approveBtn: { backgroundColor: '#43B581', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16, marginRight: 10 },
  denyBtn: { backgroundColor: '#e74c3c', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16 },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
