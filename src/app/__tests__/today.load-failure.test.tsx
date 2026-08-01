import { render, waitFor } from '@testing-library/react-native';

jest.mock('../../features/missions/api', () => ({
  getMyHouseId: jest.fn(),
  getMyMembership: jest.fn(),
  getTodayMissions: jest.fn(),
  getHouseMembers: jest.fn(),
  completeMission: jest.fn(),
  editMissionPoints: jest.fn(),
}));

jest.mock('../../features/requests/api', () => ({
  getMyIncomingSwaps: jest.fn(),
  suggestSwap: jest.fn(),
  respondSwap: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

import { getMyHouseId } from '../../features/missions/api';
import TodayScreen from '../today';

describe('TodayScreen initial load failure', () => {
  it('surfaces a retry view instead of sitting on a blank screen forever', async () => {
    (getMyHouseId as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { getByTestId } = await render(<TodayScreen />);

    await waitFor(() => {
      expect(getByTestId('today-load-error')).toBeTruthy();
    });
    expect(getByTestId('today-load-error-retry')).toBeTruthy();
  });
});
