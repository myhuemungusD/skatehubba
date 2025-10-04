import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AuthScreen from '../AuthScreen';
import { signUp, signIn } from '../../../api/authApi';

// Mock navigation
const mockNavigation = {
  replace: jest.fn(),
};

// Mock Firebase auth functions
jest.mock('../../../api/authApi', () => ({
  signUp: jest.fn(),
  signIn: jest.fn(),
  getUserProfile: jest.fn(),
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form by default', () => {
    const { getByPlaceholderText, getByText, queryByPlaceholderText } = render(
      <AuthScreen navigation={mockNavigation} />
    );
    
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(queryByPlaceholderText('Username')).toBeNull();
    expect(getByText('Log In')).toBeTruthy();
  });

  it('switches to signup form when clicked', () => {
    const { getByText, getByPlaceholderText } = render(
      <AuthScreen navigation={mockNavigation} />
    );
    
    fireEvent.press(getByText('New user? Sign Up'));
    expect(getByPlaceholderText('Username')).toBeTruthy();
  });

  it('attempts login with valid credentials', async () => {
    signIn.mockResolvedValueOnce({ uid: 'test-uid' });
    
    const { getByPlaceholderText, getByText } = render(
      <AuthScreen navigation={mockNavigation} />
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Log In'));

    expect(signIn).toHaveBeenCalledWith('test@test.com', 'password123');
  });

  it('attempts signup with valid credentials', async () => {
    signUp.mockResolvedValueOnce({ uid: 'test-uid' });
    
    const { getByText, getByPlaceholderText } = render(
      <AuthScreen navigation={mockNavigation} />
    );

    // Switch to signup
    fireEvent.press(getByText('New user? Sign Up'));

    // Fill form
    fireEvent.changeText(getByPlaceholderText('Username'), 'testuser');
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@test.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Sign Up'));

    expect(signUp).toHaveBeenCalledWith('test@test.com', 'password123', 'testuser');
  });
});
