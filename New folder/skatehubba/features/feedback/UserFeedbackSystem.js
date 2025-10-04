import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert,
  Modal,
  ScrollView,
  StyleSheet 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SAM ALTMAN STRATEGY: User Feedback Collection Engine
 * Purpose: Validate assumptions and discover what users actually want
 * Goal: Get 50 skater responses in 48 hours
 */

const UserFeedbackSystem = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Sam Altman's key validation questions for SkateHubba
  const questions = [
    {
      id: 'pain_point',
      question: "What's your biggest frustration when trying to find good skate spots?",
      placeholder: "e.g., spots are always crowded, don't know if they're skateable..."
    },
    {
      id: 'current_solution',
      question: "How do you currently discover new skate spots?",
      placeholder: "e.g., Instagram, friends, random exploration..."
    },
    {
      id: 'dream_feature',
      question: "If you had a magic skateboarding app, what would it do?",
      placeholder: "e.g., show real-time spot availability, connect with local crews..."
    },
    {
      id: 'willingness_to_pay',
      question: "Would you pay $5/month for the perfect skate spot app?",
      placeholder: "Why or why not?"
    }
  ];

  useEffect(() => {
    checkIfShouldShow();
  }, []);

  const checkIfShouldShow = async () => {
    try {
      const lastShown = await AsyncStorage.getItem('feedback_last_shown');
      const hasSubmittedBefore = await AsyncStorage.getItem('feedback_submitted');
      
      if (hasSubmittedBefore) {
        setHasSubmitted(true);
        return;
      }

      // Show feedback modal after 30 seconds of app usage
      if (!lastShown) {
        setTimeout(() => {
          setIsVisible(true);
        }, 30000);
      }
    } catch (error) {
      console.log('Error checking feedback status:', error);
    }
  };

  const submitFeedback = async () => {
    if (!feedback.trim()) {
      Alert.alert('Please share your thoughts!', 'Your feedback helps us build something you actually want.');
      return;
    }

    try {
      // Store feedback locally (in production, send to Firebase)
      const feedbackData = {
        question: questions[currentQuestion],
        answer: feedback,
        email: email,
        timestamp: new Date().toISOString(),
        userId: await AsyncStorage.getItem('user_id') || 'anonymous'
      };

      // Save to local storage for now
      const existingFeedback = await AsyncStorage.getItem('user_feedback') || '[]';
      const feedbackArray = JSON.parse(existingFeedback);
      feedbackArray.push(feedbackData);
      await AsyncStorage.setItem('user_feedback', JSON.stringify(feedbackArray));

      // TODO: Send to Firebase/backend
      console.log('Feedback saved:', feedbackData);

      if (currentQuestion < questions.length - 1) {
        setCurrentQuestion(currentQuestion + 1);
        setFeedback('');
      } else {
        // All questions completed
        await AsyncStorage.setItem('feedback_submitted', 'true');
        setHasSubmitted(true);
        setIsVisible(false);
        
        Alert.alert(
          '🛹 Thanks for helping build SkateHubba!',
          'Your feedback will help us create something skaters actually want. Want early access to new features?',
          [
            { text: 'Maybe later', style: 'cancel' },
            { text: 'Yes, keep me updated!', onPress: () => subscribeToUpdates() }
          ]
        );
      }
    } catch (error) {
      console.error('Error saving feedback:', error);
      Alert.alert('Error', 'Failed to save feedback. Please try again.');
    }
  };

  const subscribeToUpdates = async () => {
    if (email.trim()) {
      // TODO: Add to email list
      await AsyncStorage.setItem('beta_subscriber', email);
      Alert.alert('✅ You\'re in!', 'We\'ll let you know when we launch new features.');
    }
  };

  const skipQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setFeedback('');
    } else {
      setIsVisible(false);
    }
  };

  if (hasSubmitted) {
    return null; // Don't show again after submission
  }

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={() => setIsVisible(false)}
    >
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>🛹 Help Build SkateHubba</Text>
            <Text style={styles.subtitle}>
              Question {currentQuestion + 1} of {questions.length}
            </Text>
          </View>

          <View style={styles.questionContainer}>
            <Text style={styles.question}>
              {questions[currentQuestion].question}
            </Text>
            
            <TextInput
              style={styles.textInput}
              value={feedback}
              onChangeText={setFeedback}
              placeholder={questions[currentQuestion].placeholder}
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
              autoFocus
            />

            {currentQuestion === questions.length - 1 && (
              <TextInput
                style={styles.emailInput}
                value={email}
                onChangeText={setEmail}
                placeholder="Email (optional - for beta access)"
                placeholderTextColor="#666"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.submitButton} 
              onPress={submitFeedback}
            >
              <Text style={styles.submitButtonText}>
                {currentQuestion < questions.length - 1 ? 'Next Question' : 'Submit Feedback'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.skipButton} 
              onPress={skipQuestion}
            >
              <Text style={styles.skipButtonText}>Skip This Question</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>
            Your feedback helps us build features skaters actually want. 
            We're aiming for 50 responses in 48 hours!
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  questionContainer: {
    marginBottom: 30,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 15,
    lineHeight: 24,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    marginTop: 15,
  },
  buttonContainer: {
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    padding: 12,
  },
  skipButtonText: {
    color: '#666',
    fontSize: 14,
  },
  disclaimer: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default UserFeedbackSystem;