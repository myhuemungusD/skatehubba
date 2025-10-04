import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { getShops } from '../../api/shopApi';

export default function ShopScreen() {
  const [shops, setShops] = useState([]);

  useEffect(() => {
    async function loadShops() {
      try {
        const result = await getShops();
        setShops(result);
      } catch (err) {
        alert('Failed to load shops');
      }
    }
    loadShops();
  }, []);

  function handleCheckIn(shopId) {
    alert(`Checked in at ${shops.find(s => s.id === shopId).name}`);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Skate Shops Near You</Text>
      <FlatList
        data={shops}
        keyExtractor={shop => shop.id}
        renderItem={({ item }) => (
          <View style={styles.shopCard}>
            <Text style={styles.shopName}>
              {item.name} {item.isVerified && <VerifiedBadge />}
            </Text>
            <Text style={styles.shopAddr}>{item.address}</Text>
            {item.deal && (
              <Text style={styles.dealText}>🔥 {item.deal}</Text>
            )}
            <TouchableOpacity
              style={styles.checkinBtn}
              onPress={() => handleCheckIn(item.id)}
            >
              <Text style={styles.checkinText}>Check In</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

function VerifiedBadge() {
  return (
    <Text style={{ color: '#4a90e2', fontWeight: 'bold', fontSize: 15, marginLeft: 2 }}>✔️</Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontWeight: 'bold', fontSize: 23, marginBottom: 18 },
  shopCard: { backgroundColor: '#f5f7fa', borderRadius: 14, padding: 18, marginBottom: 18, elevation: 1 },
  shopName: { fontSize: 19, fontWeight: 'bold', marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  shopAddr: { fontSize: 14, color: '#666', marginBottom: 8 },
  dealText: { fontSize: 15, color: '#e74c3c', marginBottom: 10, fontWeight: 'bold' },
  checkinBtn: { backgroundColor: '#222', borderRadius: 8, paddingVertical: 7, alignSelf: 'flex-start', paddingHorizontal: 16 },
  checkinText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});
