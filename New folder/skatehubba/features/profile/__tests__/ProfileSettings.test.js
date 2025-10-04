import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileSettings from '../ProfileSettings';
import { auth } from '../../../services/firebase';
import { analyticsService } from '../../../services/analytics';

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

// Mock firebase auth
jest.mock('../../../services/firebase', () => ({
  auth: {
    currentUser: {
      email: 'test@example.com',
      reauthenticateWithCredential: jest.fn(),
      updateEmail: jest.fn(),
      updatePassword: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock analytics service
jest.mock('../../../services/analytics', () => ({
  analyticsService: {
    logEvent: jest.fn(),
  },
}));

// Mock translations
jest.mock('../../../services/localization', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

describe('ProfileSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText } = render(<ProfileSettings navigation={mockNavigation} />);
    
    expect(getByText('settings.account.updateEmail')).toBeTruthy();
    expect(getByText('settings.account.updatePassword')).toBeTruthy();
    expect(getByText('settings.account.signOut')).toBeTruthy();
    expect(getByText('settings.account.deleteAccount')).toBeTruthy();
  });

  it('handles email update correctly', async () => {
    const { getByText } = render(<ProfileSettings navigation={mockNavigation} />);

    // Mock Alert.prompt responses
    jest.spyOn(global, 'Alert').mockImplementation((_, __, buttons) => {
      // Simulate user entering password for reauthentication
      buttons[1].onPress('password123');
      // Simulate user entering new email
      buttons[1].onPress('newemail@example.com');
    });

    fireEvent.press(getByText('settings.account.updateEmail'));

    await waitFor(() => {
      expect(auth.currentUser.updateEmail).toHaveBeenCalledWith('newemail@example.com');
      expect(analyticsService.logEvent).toHaveBeenCalledWith('update_email', {
        category: 'profile',
      });
    });
  });

  it('handles password update correctly', async () => {
    const { getByText } = render(<ProfileSettings navigation={mockNavigation} />);

    // Mock Alert.prompt responses
    jest.spyOn(global, 'Alert').mockImplementation((_, __, buttons) => {
      // Simulate user entering current password
      buttons[1].onPress('currentpass123');
      // Simulate user entering new password
      buttons[1].onPress('newpass123');
    });

    fireEvent.press(getByText('settings.account.updatePassword'));

    await waitFor(() => {
      expect(auth.currentUser.updatePassword).toHaveBeenCalledWith('newpass123');
      expect(analyticsService.logEvent).toHaveBeenCalledWith('update_password', {
        category: 'profile',
      });
    });
  });

  it('handles account deletion correctly', async () => {
    const { getByText } = render(<ProfileSettings navigation={mockNavigation} />);

    // Mock Alert.alert for deletion confirmation
    jest.spyOn(global, 'Alert').mockImplementation((_, __, buttons) => {
      // Simulate user confirming deletion
      buttons[1].onPress();
      // Simulate user entering password for reauthentication
      buttons[1].onPress('password123');
    });

    fireEvent.press(getByText('settings.account.deleteAccount'));

    await waitFor(() => {
      expect(auth.currentUser.delete).toHaveBeenCalled();
      expect(analyticsService.logEvent).toHaveBeenCalledWith('delete_account', {
        category: 'profile',
      });
    });
  });

  it('shows loading state during operations', async () => {
    const { getByText, getByTestId } = render(<ProfileSettings navigation={mockNavigation} />);

    // Make updateEmail take some time
    auth.currentUser.updateEmail.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

    // Mock Alert.prompt responses
    jest.spyOn(global, 'Alert').mockImplementation((_, __, buttons) => {
      buttons[1].onPress('password123');
      buttons[1].onPress('newemail@example.com');
    });

    fireEvent.press(getByText('settings.account.updateEmail'));

    // Check if loading indicator is shown
    expect(getByTestId('loading-indicator')).toBeTruthy();

    await waitFor(() => {
      expect(auth.currentUser.updateEmail).toHaveBeenCalled();
    });
  });
});
