import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import ProfileScreen from '../features/profile/ProfileScreen';
import ShopScreen from '../features/shop/ShopScreen';
import SessionsScreen from '../features/sessions/SessionsScreen';
import ChallengeScreen from '../features/challenge/ChallengeScreen';
import LobbyScreen from '../features/lobby/LobbyScreen';
import AuthScreen from '../features/onboarding/AuthScreen';

expect.extend({ toMatchImageSnapshot });

// Mock navigation
const navigationMock = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

describe('App Screenshots', () => {
  const screens = [
    { name: 'Auth', component: AuthScreen },
    { name: 'Profile', component: ProfileScreen },
    { name: 'Shop', component: ShopScreen },
    { name: 'Sessions', component: SessionsScreen },
    { name: 'Challenge', component: ChallengeScreen },
    { name: 'Lobby', component: LobbyScreen },
  ];

  screens.forEach(({ name, component: Component }) => {
    it(`captures ${name} screen`, async () => {
      const { container } = render(
        <NavigationContainer>
          <Component navigation={navigationMock} />
        </NavigationContainer>
      );
      
      // Wait for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(container).toMatchImageSnapshot({
        customSnapshotsDir: '__screenshots__',
        customDiffDir: '__screenshots__/diffs',
      });
    });
  });
});
