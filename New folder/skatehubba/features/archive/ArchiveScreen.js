import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';

const demoArchive = [
  {
    id: 'archive-1',
    spot: 'Venice Beach Skatepark',
    date: '2024-07-10',
    trick: 'Kickflip over the hip',
    media: require('../../assets/images/clip1-demo.jpg'),
    desc: 'First time landing this line!',
  },
  {
    id: 'archive-2',
    spot: 'The Berrics',
    date: '2024-07-03',
    trick: 'Switch Crook down the hubba',
    media: require('../../assets/images/clip2-demo.jpg'),
    desc: 'Session with @kickflipkid and @olliemama.',
  },
];

export default function ArchiveScreen() {
  const [archive, setArchive] = useState(demoArchive);

  function handleAddClip() {
    // Real app: open camera or gallery
    alert('Feature coming soon: Add a new clip or photo!');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Skate Archive</Text>
      <TouchableOpacity style={styles.addBtn} onPress={handleAddClip}>
        <Text style={styles.addBtnText}>+ Add Clip</Text>
      </TouchableOpacity>
      <FlatList
        data={archive}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.clipCard}>
            <Image source={item.media} style={styles.clipImage} />
            <View style={styles.infoRow}>
              <Text style={styles.trick}>{item.trick}</Text>
              <Text style={styles.spot}>{item.spot}</Text>
            </View>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 22 },
  title: { fontWeight: 'bold', fontSize: 22, marginBottom: 12 },
  addBtn: { backgroundColor: '#4a90e2', borderRadius: 8, alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 18, marginBottom: 13 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  clipCard: { backgroundColor: '#f7f7fa', borderRadius: 14, padding: 15, marginBottom: 15 },
  clipImage: { width: '100%', height: 170, borderRadius: 10, marginBottom: 9 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  trick: { fontWeight: 'bold', fontSize: 16 },
  spot: { color: '#4a90e2', fontWeight: 'bold', fontSize: 15 },
  date: { fontSize: 12, color: '#aaa', marginBottom: 5 },
  desc: { fontSize: 13, color: '#444' },
});
