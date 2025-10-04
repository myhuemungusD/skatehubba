import React from 'react';
import { Modal, View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

export default function ChallengeModal({ visible, skater, onClose, onSendChallenge }) {
  if (!skater) return null;

  const challengeTypes = [
    { id: 'trick', name: 'Trick Battle', icon: 'skating', description: 'Best trick wins' },
    { id: 'speed', name: 'Speed Run', icon: 'tachometer-alt', description: 'Fastest time wins' },
    { id: 'style', name: 'Style Contest', icon: 'star', description: 'Most stylish wins' },
    { id: 'combo', name: 'Combo Chain', icon: 'link', description: 'Longest combo wins' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Challenge {skater.username}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <FontAwesome5 name="times" size={20} color="#FFD600" />
            </TouchableOpacity>
          </View>

          {/* Skater Info */}
          <View style={styles.skaterInfo}>
            <Image source={{ uri: skater.avatarUrl }} style={styles.avatar} />
            <Text style={styles.skaterName}>{skater.username}</Text>
            <Text style={styles.skaterLevel}>Level {skater.level}</Text>
          </View>

          {/* Challenge Types */}
          <Text style={styles.sectionTitle}>Choose Challenge Type:</Text>
          {challengeTypes.map(challenge => (
            <TouchableOpacity
              key={challenge.id}
              style={styles.challengeOption}
              onPress={() => {
                onSendChallenge(skater, challenge);
                onClose();
              }}
            >
              <FontAwesome5 name={challenge.icon} size={24} color="#FFD600" />
              <View style={styles.challengeText}>
                <Text style={styles.challengeName}>{challenge.name}</Text>
                <Text style={styles.challengeDesc}>{challenge.description}</Text>
              </View>
              <FontAwesome5 name="chevron-right" size={16} color="#666" />
            </TouchableOpacity>
          ))}

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#242a2f',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: '#FFD600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFD600',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 5,
  },
  skaterInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  skaterName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skaterLevel: {
    color: '#FFD600',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#FFD600',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  challengeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1d21',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  challengeText: {
    flex: 1,
    marginLeft: 15,
  },
  challengeName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  challengeDesc: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
