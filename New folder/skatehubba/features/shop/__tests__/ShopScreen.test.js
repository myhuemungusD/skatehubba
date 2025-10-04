import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ShopScreen from '../ShopScreen';

jest.mock('../../constants/shops', () => [
  {
    id: 'shop-1',
    name: 'Baker Boys Skate Shop',
    address: '1951 S La Cienega Blvd, Los Angeles, CA',
    isVerified: true,
    deal: '15% off for checked-in skaters today!',
  },
]);

describe('ShopScreen', () => {
  it('renders shop list and details', () => {
    const { getByText } = render(<ShopScreen />);
    expect(getByText('Skate Shops Near You')).toBeTruthy();
    expect(getByText('Baker Boys Skate Shop')).toBeTruthy();
    expect(getByText('1951 S La Cienega Blvd, Los Angeles, CA')).toBeTruthy();
    expect(getByText('🔥 15% off for checked-in skaters today!')).toBeTruthy();
  });

  it('shows alert when checking in', () => {
    const { getByText } = render(<ShopScreen />);
    const checkInBtn = getByText('Check In');
    global.alert = jest.fn();
    fireEvent.press(checkInBtn);
    expect(global.alert).toHaveBeenCalledWith('Checked in at Baker Boys Skate Shop');
  });
});
