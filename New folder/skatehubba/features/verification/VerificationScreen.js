import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';

export default function VerificationScreen() {
  const [type, setType] = useState('pro'); // 'pro' | 'shop' | 'flow'
  const [brand, setBrand] = useState('');
  const [reason, setReason] = useState('');

  function handleRequestVerification() {
    // Real app: send request to backend/admins
    Alert.alert('Request Sent', `Verification for type: ${type}, brand/shop: ${brand}\nReason: ${reason}`);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Request Verification</Text>
      <View style={styles.typeRow}>
        {['pro', 'shop', 'flow'].map((t) => (
          <TouchableOpacity key={t} style={[styles.typeBtn, type === t && styles.selectedType]} onPress={() => setType(t)}>
            <Text style={[styles.typeText, type === t && styles.selectedTypeText]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder={type === 'shop' ? 'Shop Name' : 'Sponsor/Brand Name'}
        value={brand}
        onChangeText={setBrand}
      />
      <TextInput
        style={[styles.input, { height: 66 }]}
        placeholder="Why should you be verified? (Optional)"
        value={reason}
        onChangeText={setReason}
        multiline
      />
      <TouchableOpacity style={styles.submitBtn} onPress={handleRequestVerification}>
        <Text style={styles.submitText}>Request Verification</Text>
      </TouchableOpacity>
      <Text style={styles.info}>
        Verified badges help pros, shops, and sponsored skaters stand out in the skate community. Flow? Shop? Pro? Show the world!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 22 },
  title: { fontWeight: 'bold', fontSize: 21, marginBottom: 13 },
  typeRow: { flexDirection: 'row', marginBottom: 10 },
  typeBtn: { backgroundColor: '#eee', borderRadius: 8, marginRight: 7, paddingVertical: 6, paddingHorizontal: 16 },
  selectedType: { backgroundColor: '#4a90e2' },
  typeText: { fontWeight: 'bold', color: '#666' },
  selectedTypeText: { color: '#fff' },
  input: { backgroundColor: '#f7f7fa', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, marginBottom: 10, borderColor: '#ddd', borderWidth: 1 },
  submitBtn: { backgroundColor: '#222', borderRadius: 8, marginTop: 13, paddingVertical: 10, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  info: { fontSize: 12, color: '#666', marginTop: 18, textAlign: 'center' },
});
