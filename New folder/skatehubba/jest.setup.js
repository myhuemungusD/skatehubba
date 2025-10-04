// Mock the Alert global
global.alert = jest.fn();

// Mock expo-localization
jest.mock('expo-localization', () => ({
  locale: 'en',
}));

// Mock firebase
jest.mock('./services/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
}));

// Mock all images with a module name mapper approach
jest.mock('./assets/images/skater-avatar.png', () => 'skater-avatar.png');
jest.mock('./assets/images/graffiti-wall.png', () => 'graffiti-wall.png');

// Mock React Native components that might cause issues
jest.mock('react-native/Libraries/LogBox/LogBox', () => ({
  ignoreLogs: jest.fn(),
  ignoreAllLogs: jest.fn(),
}));

// Mock Expo modules that might not be available in test environment
jest.mock('expo-constants', () => ({
  default: {
    appOwnership: 'standalone',
    manifest: {},
  },
}));

// Setup @testing-library/react-native
import '@testing-library/react-native/extend-expect';

// Disable console warnings during tests
console.warn = jest.fn();
