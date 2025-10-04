import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from '../../services/localization';

const LanguagePicker = ({ visible, onClose, onSelectLanguage }) => {
  const { t, i18n } = useTranslation();

  const languages = [
    { code: 'en', name: t('languages.en') },
    { code: 'es', name: t('languages.es') },
  ];

  const handleSelectLanguage = async (langCode) => {
    await i18n.changeLanguage(langCode);
    onSelectLanguage(langCode);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('settings.language')}</Text>
          {languages.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.languageButton,
                i18n.language === lang.code && styles.selectedLanguage,
              ]}
              onPress={() => handleSelectLanguage(lang.code)}
            >
              <Text
                style={[
                  styles.languageText,
                  i18n.language === lang.code && styles.selectedLanguageText,
                ]}
              >
                {lang.name}
              </Text>
              {i18n.language === lang.code && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{t('tutorial.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#2C2C2E',
  },
  selectedLanguage: {
    backgroundColor: '#0A84FF',
  },
  languageText: {
    fontSize: 16,
    color: '#fff',
  },
  selectedLanguageText: {
    fontWeight: 'bold',
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 20,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LanguagePicker;
