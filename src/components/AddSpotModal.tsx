import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAddSpotStore } from '../stores/addSpotStore';
import { createSpot } from '../services/spotService';

export const AddSpotModal = () => {
  const { isPinningMode, tempCoordinates, setPinningMode, reset } = useAddSpotStore();

  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImagePick = async () => {
    // FIX: Optimized Permissions Check
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!req.granted) {
        Alert.alert('Permission needed', 'Photo access is required to show the spot.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    // FIX #4: Prevent Double Submission
    if (isSubmitting) return;

    if (!tempCoordinates || !imageUri || !description) {
      Alert.alert('Missing Info', 'Please add a photo and description.');
      return;
    }

    try {
      setIsSubmitting(true);
      await createSpot({
        coordinates: tempCoordinates,
        description,
        imageUri,
      });

      Alert.alert('Success', 'Spot added to the map!');
      reset();
      setDescription('');
      setImageUri(null);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to upload spot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Initial State
  if (!isPinningMode) {
    return (
      <View style={styles.floatingButtonContainer}>
        <TouchableOpacity style={styles.addButton} onPress={() => setPinningMode(true)}>
          <Text style={styles.addButtonText}>+ ADD SPOT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 2. Pinning State
  if (isPinningMode && !tempCoordinates) {
    return (
      <View style={styles.instructionBanner}>
        <Text style={styles.instructionText}>Tap the location on the map</Text>
        <TouchableOpacity onPress={reset} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. Form State
  return (
    <View style={styles.formContainer}>
      <Text style={styles.header}>New Spot Details</Text>

      <TouchableOpacity onPress={handleImagePick} style={styles.imagePicker}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        ) : (
          <Text style={styles.placeholderText}>+ Upload Photo</Text>
        )}
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Description (e.g., 5-stair with good run up)"
        placeholderTextColor="#999"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <View style={styles.actionRow}>
        <TouchableOpacity onPress={reset} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSubmit} style={styles.primaryButton} disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Post Spot</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingButtonContainer: { position: 'absolute', bottom: 40, alignSelf: 'center' },
  addButton: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 30 },
  addButtonText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  instructionBanner: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionText: { color: '#FFF', fontWeight: '600' },
  cancelText: { color: '#FF4444', fontWeight: 'bold' },
  formContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  imagePicker: {
    height: 150,
    backgroundColor: '#333',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  placeholderText: { color: '#AAA' },
  input: {
    backgroundColor: '#333',
    color: '#FFF',
    borderRadius: 8,
    padding: 12,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  primaryButton: { flex: 1, backgroundColor: '#D11A2A', padding: 16, borderRadius: 8, alignItems: 'center' },
  primaryButtonText: { color: '#FFF', fontWeight: 'bold' },
  secondaryButton: { flex: 1, backgroundColor: '#333', padding: 16, borderRadius: 8, alignItems: 'center' },
  secondaryButtonText: { color: '#FFF' },
  cancelButton: { marginLeft: 10 },
});
