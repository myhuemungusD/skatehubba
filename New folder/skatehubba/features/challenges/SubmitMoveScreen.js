import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import { storage } from '../../config/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { playMove } from '../../api/challengeApi';
import { TrickJudgement } from './TrickJudgement';

export function SubmitMoveScreen({ route, navigation }) {
  const { challengeId } = route.params;
  const [mediaUri, setMediaUri] = useState(null);
  const [trickName, setTrickName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isVideo, setIsVideo] = useState(false);
  const [judgement, setJudgement] = useState(null);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
      setIsVideo(result.assets[0].type === 'video');
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status === 'granted') {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        setMediaUri(result.assets[0].uri);
        setIsVideo(true);
      }
    }
  };

  const uploadMedia = async () => {
    if (!mediaUri) return null;

    const response = await fetch(mediaUri);
    const blob = await response.blob();
    const timestamp = Date.now();
    const fileExtension = mediaUri.split('.').pop();
    const fileName = `moves/${challengeId}/${timestamp}.${fileExtension}`;
    const storageRef = ref(storage, fileName);

    const uploadTask = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          // Progress can be handled here
        },
        (error) => {
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const requestRetry = async () => {
    setUploading(true);
    try {
      const result = await requestMoveRetry(challengeId);
      if (result.granted) {
        alert('Retry granted! Record your new attempt.');
        setMediaUri(null);
        setTrickName('');
      } else {
        alert('Retry not approved by all players. Your current attempt will be submitted.');
        await submitCurrentMove();
      }
    } catch (error) {
      console.error('Error requesting retry:', error);
      alert('Failed to request retry. Your current attempt will be submitted.');
      await submitCurrentMove();
    } finally {
      setUploading(false);
    }
  };

  const validateAndSubmitMove = async () => {
    if (!mediaUri) {
      alert('Yo! Record or pick your trick video first! 🎥');
      return;
    }

    setUploading(true);
    try {
      // First, judge the trick
      const trickJudgement = judgeTrick(mediaUri);
      setJudgement(trickJudgement);

      if (trickJudgement.isValid) {
        const mediaUrl = await uploadMedia();
        await playMove(challengeId, {
          trickName: trickName.trim() || 'Untitled Trick',
          mediaUrl,
          mediaType: isVideo ? 'video' : 'image',
          timestamp: Date.now(),
          isRetry: false,
          validation: {
            rules: trickJudgement.rules,
            feedback: trickJudgement.feedback,
          }
        });
        
        // Show hype message before navigating back
        Alert.alert(
          '🔥 SICK!',
          trickJudgement.hype,
          [{ text: 'Let\'s Go! 🚀', onPress: () => navigation.goBack() }]
        );
      } else {
        // If trick didn't pass validation, show retry dialog
        Alert.alert(
          '💪 Almost There!',
          'Want to request a retry from the other players?',
          [
            {
              text: 'Request Retry 🎯',
              onPress: requestRetry,
              style: 'default',
            },
            {
              text: 'Submit Anyway 🛹',
              onPress: () => submitMove(mediaUrl, false),
              style: 'default',
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error submitting move:', error);
      alert('Whoops! Technical bail - let\'s try that again! 🛠️');
    } finally {
      setUploading(false);
    }
  };

  // Auto-submit when media is recorded/selected
  useEffect(() => {
    if (mediaUri) {
      Alert.alert(
        'Submit Move',
        'Do you want to request a retry? If not, this attempt will be submitted automatically.',
        [
          {
            text: 'Request Retry',
            onPress: requestRetry,
            style: 'default',
          },
          {
            text: 'Submit',
            onPress: submitCurrentMove,
            style: 'default',
          },
        ],
        { cancelable: false }
      );
    }
  }, [mediaUri]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🎥 Show Us Your Skills!</Text>
      <Text style={styles.subtitle}>Your turn to bring the heat!</Text>
      
      <View style={styles.mediaSection}>
        {mediaUri ? (
          <>
            {isVideo ? (
              <Video
                source={{ uri: mediaUri }}
                style={styles.preview}
                useNativeControls
                resizeMode="contain"
              />
            ) : (
              <Image source={{ uri: mediaUri }} style={styles.preview} />
            )}
            <Text style={styles.hypeText}>🔥 Looking clean! Ready to submit?</Text>
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Drop your best trick here!</Text>
            <Text style={styles.placeholderSubtext}>Remember: One try, make it count! 🎯</Text>
          </View>
        )}
      </View>

      {judgement && (
        <TrickJudgement judgement={judgement} style={styles.judgement} />
      )}

      <TextInput
        style={styles.input}
        placeholder="Name that trick! 🎩"
        value={trickName}
        onChangeText={setTrickName}
        maxLength={50}
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.captureButton]}
          onPress={recordVideo}
        >
          <Text style={styles.buttonText}>🎥 Record</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.libraryButton]}
          onPress={pickMedia}
        >
          <Text style={styles.buttonText}>🎬 Gallery</Text>
        </TouchableOpacity>
      </View>

      {mediaUri && (
        <TouchableOpacity
          style={[
            styles.submitButton,
            uploading && styles.submitButtonDisabled
          ]}
          onPress={validateAndSubmitMove}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              🚀 Send It!
            </Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  mediaSection: {
    marginBottom: 20,
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 10,
  },
  placeholder: {
    width: '100%',
    height: 300,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  placeholderText: {
    color: '#666666',
    fontSize: 16,
  },
  mediaButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#FF5722',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  captureButton: {
    backgroundColor: '#FF4081',
  },
  libraryButton: {
    backgroundColor: '#3F51B5',
  },
  judgement: {
    marginBottom: 20,
  },
});
