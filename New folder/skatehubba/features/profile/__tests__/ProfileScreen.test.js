import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';
import { useAuth } from '../../../hooks/useAuth';

// Mock the useAuth hook
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

describe('ProfileScreen', () => {
  const mockUser = {
    username: 'testuser',
    avatar: require('../../../assets/images/profile-demo.png'),
    isVerified: true,
    sponsors: ['Test Brand'],
    spotsSkated: 42,
    clips: 16,
    followers: 224,
    following: 118,
    bio: "Test bio",
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: mockUser });
  });

  it('renders user profile data correctly', () => {
    const { getByText } = render(<ProfileScreen />);
    
    expect(getByText('@testuser')).toBeTruthy();
    expect(getByText('Test bio')).toBeTruthy();
    expect(getByText('42')).toBeTruthy(); // spots
    expect(getByText('16')).toBeTruthy(); // clips
    expect(getByText('224')).toBeTruthy(); // followers
    expect(getByText('118')).toBeTruthy(); // following
  });

  it('displays verified badge when user is verified', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('✔️')).toBeTruthy();
  });

  it('shows sponsor badges', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('Test Brand')).toBeTruthy();
  });
});
