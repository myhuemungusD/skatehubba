import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from '../../services/localization';

const ClipTypeSelector = ({ selectedType, onTypeSelect }) => {
  const { t } = useTranslation();
  
  const clipTypes = [
    { id: 'trick', icon: 'flash', label: t('ar.clip.types.trick') },
    { id: 'line', icon: 'trending-up', label: t('ar.clip.types.line') },
    { id: 'spot', icon: 'location', label: t('ar.clip.types.spot') },
    { id: 'challenge', icon: 'trophy', label: t('ar.clip.types.challenge') },
  ];

  return (
    <View style={styles.typeSelector}>
      <Text style={styles.sectionTitle}>{t('ar.clip.type')}</Text>
      <View style={styles.typeGrid}>
        {clipTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeOption,
              selectedType === type.id && styles.typeOptionSelected,
            ]}
            onPress={() => onTypeSelect(type.id)}
            accessible={true}
            accessibilityLabel={type.label}
            accessibilityRole="button"
          >
            <Ionicons
              name={type.icon}
              size={24}
              color={selectedType === type.id ? '#FFFFFF' : '#CCCCCC'}
            />
            <Text
              style={[
                styles.typeLabel,
                selectedType === type.id && styles.typeLabelSelected,
              ]}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const DifficultySelector = ({ selectedDifficulty, onDifficultySelect }) => {
  const { t } = useTranslation();
  
  const difficulties = [
    { id: 'beginner', color: '#4CAF50', label: t('ar.clip.difficulty.beginner') },
    { id: 'intermediate', color: '#FF9800', label: t('ar.clip.difficulty.intermediate') },
    { id: 'advanced', color: '#F44336', label: t('ar.clip.difficulty.advanced') },
  ];

  return (
    <View style={styles.difficultySelector}>
      <Text style={styles.sectionTitle}>{t('ar.clip.difficulty.title')}</Text>
      <View style={styles.difficultyRow}>
        {difficulties.map((difficulty) => (
          <TouchableOpacity
            key={difficulty.id}
            style={[
              styles.difficultyOption,
              { borderColor: difficulty.color },
              selectedDifficulty === difficulty.id && {
                backgroundColor: difficulty.color,
              },
            ]}
            onPress={() => onDifficultySelect(difficulty.id)}
            accessible={true}
            accessibilityLabel={difficulty.label}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.difficultyLabel,
                selectedDifficulty === difficulty.id && styles.difficultyLabelSelected,
              ]}
            >
              {difficulty.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default function ClipDropModal({ visible, onClose, onDrop }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedType, setSelectedType] = useState('trick');
  const [selectedDifficulty, setSelectedDifficulty] = useState('intermediate');
  const [videoUri, setVideoUri] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedType('trick');
    setSelectedDifficulty('intermediate');
    setVideoUri(null);
    setIsUploading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSelectVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 30, // 30 seconds max
      });

      if (!result.canceled) {
        setVideoUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(
        t('ar.clip.error.title'),
        t('ar.clip.error.selectVideo')
      );
    }
  };

  const handleRecordVideo = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 30,
      });

      if (!result.canceled) {
        setVideoUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(
        t('ar.clip.error.title'),
        t('ar.clip.error.recordVideo')
      );
    }
  };

  const handleDrop = async () => {
    if (!title.trim()) {
      Alert.alert(
        t('ar.clip.error.title'),
        t('ar.clip.error.noTitle')
      );
      return;
    }

    if (!videoUri) {
      Alert.alert(
        t('ar.clip.error.title'),
        t('ar.clip.error.noVideo')
      );
      return;
    }

    try {
      setIsUploading(true);

      const clipData = {
        title: title.trim(),
        description: description.trim(),
        type: selectedType,
        difficulty: selectedDifficulty,
        videoUri,
        timestamp: new Date().toISOString(),
      };

      await onDrop(clipData);
      resetForm();
    } catch (error) {
      Alert.alert(
        t('ar.clip.error.title'),
        t('ar.clip.error.upload')
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            accessible={true}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('ar.clip.drop.title')}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Video Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ar.clip.video')}</Text>
            {videoUri ? (
              <View style={styles.videoSelected}>
                <Ionicons name="videocam" size={48} color="#4CAF50" />
                <Text style={styles.videoSelectedText}>
                  {t('ar.clip.videoSelected')}
                </Text>
                <TouchableOpacity
                  style={styles.changeVideoButton}
                  onPress={handleSelectVideo}
                >
                  <Text style={styles.changeVideoText}>
                    {t('ar.clip.changeVideo')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.videoOptions}>
                <TouchableOpacity
                  style={styles.videoOption}
                  onPress={handleRecordVideo}
                  accessible={true}
                  accessibilityLabel={t('ar.clip.record')}
                  accessibilityRole="button"
                >
                  <Ionicons name="videocam" size={32} color="#FFFFFF" />
                  <Text style={styles.videoOptionText}>
                    {t('ar.clip.record')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.videoOption}
                  onPress={handleSelectVideo}
                  accessible={true}
                  accessibilityLabel={t('ar.clip.select')}
                  accessibilityRole="button"
                >
                  <Ionicons name="folder" size={32} color="#FFFFFF" />
                  <Text style={styles.videoOptionText}>
                    {t('ar.clip.select')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Title Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ar.clip.title')}</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder={t('ar.clip.titlePlaceholder')}
              placeholderTextColor="#666666"
              maxLength={50}
              accessible={true}
              accessibilityLabel={t('ar.clip.title')}
            />
          </View>

          {/* Description Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ar.clip.description')}</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('ar.clip.descriptionPlaceholder')}
              placeholderTextColor="#666666"
              multiline
              numberOfLines={3}
              maxLength={200}
              accessible={true}
              accessibilityLabel={t('ar.clip.description')}
            />
          </View>

          {/* Clip Type */}
          <ClipTypeSelector
            selectedType={selectedType}
            onTypeSelect={setSelectedType}
          />

          {/* Difficulty */}
          <DifficultySelector
            selectedDifficulty={selectedDifficulty}
            onDifficultySelect={setSelectedDifficulty}
          />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.dropButton, (!title.trim() || !videoUri || isUploading) && styles.dropButtonDisabled]}
            onPress={handleDrop}
            disabled={!title.trim() || !videoUri || isUploading}
            accessible={true}
            accessibilityLabel={t('ar.clip.drop.action')}
            accessibilityRole="button"
          >
            {isUploading ? (
              <Text style={styles.dropButtonText}>{t('ar.clip.uploading')}</Text>
            ) : (
              <>
                <Ionicons name="location" size={20} color="#FFFFFF" />
                <Text style={styles.dropButtonText}>{t('ar.clip.drop.action')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  videoOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  videoOption: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  videoOptionText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  videoSelected: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  videoSelectedText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  changeVideoButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#333333',
    borderRadius: 8,
  },
  changeVideoText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  textInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    marginBottom: 24,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  typeOption: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '48%',
    marginBottom: 8,
  },
  typeOptionSelected: {
    backgroundColor: '#007AFF',
  },
  typeLabel: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  typeLabelSelected: {
    color: '#FFFFFF',
  },
  difficultySelector: {
    marginBottom: 24,
  },
  difficultyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  difficultyOption: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  difficultyLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  difficultyLabelSelected: {
    color: '#FFFFFF',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  dropButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropButtonDisabled: {
    backgroundColor: '#333333',
  },
  dropButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
