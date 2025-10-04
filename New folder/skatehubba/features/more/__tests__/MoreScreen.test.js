import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MoreScreen from '../MoreScreen';
import { useAuth } from '../../../context/AuthContext';
import { canAccessScreen } from '../../../utils/roles';

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
};

// Mock useNavigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

// Mock auth hook
jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock canAccessScreen
jest.mock('../../../utils/roles', () => ({
  canAccessScreen: jest.fn(),
}));

// Mock translations
jest.mock('../../../services/localization', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

describe('MoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ userRole: 'user' });
    canAccessScreen.mockReturnValue(true);
  });

  it('renders all menu items for admin users', () => {
    useAuth.mockReturnValue({ userRole: 'admin' });
    const { getByTestId } = render(<MoreScreen />);

    expect(getByTestId('menu-lobbies')).toBeTruthy();
    expect(getByTestId('menu-checkins')).toBeTruthy();
    expect(getByTestId('menu-archive')).toBeTruthy();
    expect(getByTestId('menu-verify')).toBeTruthy();
    expect(getByTestId('menu-admin')).toBeTruthy();
  });

  it('filters menu items based on user role', () => {
    canAccessScreen
      .mockReturnValueOnce(true)  // Lobbies
      .mockReturnValueOnce(true)  // Checkins
      .mockReturnValueOnce(true)  // Archive
      .mockReturnValueOnce(false) // Verify
      .mockReturnValueOnce(false); // Admin

    const { queryByTestId } = render(<MoreScreen />);

    expect(queryByTestId('menu-lobbies')).toBeTruthy();
    expect(queryByTestId('menu-checkins')).toBeTruthy();
    expect(queryByTestId('menu-archive')).toBeTruthy();
    expect(queryByTestId('menu-verify')).toBeFalsy();
    expect(queryByTestId('menu-admin')).toBeFalsy();
  });

  it('navigates to the correct screen when menu item is pressed', () => {
    const { getByTestId } = render(<MoreScreen />);

    fireEvent.press(getByTestId('menu-lobbies'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Lobbies');

    fireEvent.press(getByTestId('menu-checkins'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Checkins');
  });

  it('has proper accessibility labels', () => {
    const { getByLabelText } = render(<MoreScreen />);

    expect(getByLabelText('more.title')).toBeTruthy();
    expect(getByLabelText('more.lobbies')).toBeTruthy();
    expect(getByLabelText('more.checkins')).toBeTruthy();
  });
});
