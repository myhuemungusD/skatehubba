import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '../services/localization';

const { width } = Dimensions.get('window');

const OnboardingScreen = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const { t } = useTranslation();

  const steps = [
    {
      key: '1',
      image: require('../assets/images/onboarding-connect.png'),
      title: t('onboarding.steps.1.title'),
      description: t('onboarding.steps.1.description'),
    },
    {
      key: '2',
      image: require('../assets/images/onboarding-challenge.png'),
      title: t('onboarding.steps.2.title'),
      description: t('onboarding.steps.2.description'),
    },
    {
      key: '3',
      image: require('../assets/images/onboarding-progress.png'),
      title: t('onboarding.steps.3.title'),
      description: t('onboarding.steps.3.description'),
    },
    {
      key: '4',
      image: require('../assets/images/onboarding-verify.png'),
      title: t('onboarding.steps.4.title'),
      description: t('onboarding.steps.4.description'),
    },
  ];

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem('@onboarding_complete', 'true');
      onComplete();
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = steps[currentStep];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.skipContainer}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Image source={step.image} style={styles.image} />
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
      </View>

      <View style={styles.pagination}>
        {steps.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              index === currentStep && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>

      <View style={styles.buttonsContainer}>
        {currentStep > 0 && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handlePrevious}
          >
            <Text style={styles.buttonTextSecondary}>
              {t('onboarding.previous')}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleNext}
        >
          <Text style={styles.buttonTextPrimary}>
            {currentStep === steps.length - 1
              ? t('onboarding.getStarted')
              : t('onboarding.next')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  skipContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
  },
  skipText: {
    color: '#666',
    fontSize: 16,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  image: {
    width: width * 0.8,
    height: width * 0.8,
    marginBottom: 40,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#fff',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#333',
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OnboardingScreen;
