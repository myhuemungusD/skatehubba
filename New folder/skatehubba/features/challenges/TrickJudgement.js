import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export function TrickJudgement({ judgement, style }) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {judgement.isValid ? '🎯 Trick Check' : '💪 Quick Tips'}
        </Text>
      </View>

      <Text style={[
        styles.feedback,
        judgement.isValid ? styles.feedbackValid : styles.feedbackInvalid
      ]}>
        {judgement.feedback}
      </Text>

      {judgement.isValid && judgement.hype && (
        <Text style={styles.hype}>{judgement.hype}</Text>
      )}

      <View style={styles.rulesList}>
        {judgement.rules.map(({ rule, passed, description }) => (
          <View key={rule} style={styles.ruleItem}>
            <Icon 
              name={passed ? 'check-circle' : 'information'}
              size={20}
              color={passed ? '#4CAF50' : '#FF9800'}
            />
            <Text style={[
              styles.ruleText,
              passed ? styles.rulePassed : styles.ruleFailed
            ]}>
              {description}
            </Text>
          </View>
        ))}
      </View>

      {!judgement.isValid && (
        <Text style={styles.encouragement}>
          You're super close! Keep that energy up! 🔥
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
  },
  feedback: {
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  feedbackValid: {
    color: '#4CAF50',
  },
  feedbackInvalid: {
    color: '#FF9800',
  },
  hype: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF5722',
    textAlign: 'center',
    marginBottom: 16,
  },
  rulesList: {
    marginTop: 12,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ruleText: {
    fontSize: 16,
    marginLeft: 8,
    flex: 1,
  },
  rulePassed: {
    color: '#4CAF50',
  },
  ruleFailed: {
    color: '#FF9800',
  },
  encouragement: {
    fontSize: 16,
    color: '#FF5722',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '600',
  },
});
