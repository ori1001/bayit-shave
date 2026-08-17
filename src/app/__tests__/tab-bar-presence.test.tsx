import { render, waitFor } from '@testing-library/react-native';

/**
 * The tab bar used to be rendered by Today and nowhere else, so opening the
 * calendar, the balance or the inbox left no visible way back. These render each
 * destination and assert the bar is there.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({ houseId: 'house-1' }),
}));

jest.mock('../../features/missions/api', () => ({
  getMyMembership: jest.fn(() => Promise.resolve({ id: 'mem-1', role: 'admin' })),
  getHouseMembers: jest.fn(() => Promise.resolve([])),
  getMonthMissions: jest.fn(() => Promise.resolve([])),
  getSuggestions: jest.fn(() => Promise.resolve([])),
  resolveSuggestion: jest.fn(),
  editMissionSchedule: jest.fn(),
  localDateString: jest.fn(() => '2026-08-17'),
}));

jest.mock('../../features/balance/api', () => ({
  getPointsPool: jest.fn(() => Promise.resolve([])),
  getOpenMissions: jest.fn(() => Promise.resolve([])),
  runBalance: jest.fn(),
  assignMission: jest.fn(),
}));

jest.mock('../../features/requests/api', () => ({
  getPendingSwapsForAdmin: jest.fn(() => Promise.resolve([])),
  getPendingUnavailability: jest.fn(() => Promise.resolve([])),
  resolveSwap: jest.fn(),
  resolveUnavailability: jest.fn(),
}));

jest.mock('../../features/calendar-sync/api', () => ({
  syncMissionsToDeviceCalendar: jest.fn(() => Promise.resolve(null)),
}));

import CalendarScreen from '../calendar';
import BalanceScreen from '../balance';
import SuggestionsScreen from '../missions/suggestions';

const screens: [string, React.ComponentType][] = [
  ['calendar', CalendarScreen],
  ['balance', BalanceScreen],
  ['inbox', SuggestionsScreen],
];

describe.each(screens)('%s screen', (name, ScreenUnderTest) => {
  it('keeps the bottom navigation on screen', async () => {
    const { getByTestId } = await render(<ScreenUnderTest />);

    await waitFor(() => {
      expect(getByTestId('tab-today')).toBeTruthy();
    });
    expect(getByTestId('tab-calendar')).toBeTruthy();
    expect(getByTestId('tab-balance')).toBeTruthy();
    expect(getByTestId('tab-more')).toBeTruthy();
    // Admin in this fixture, so the inbox tab is part of the bar too.
    expect(getByTestId('tab-inbox')).toBeTruthy();
    expect(getByTestId(`tab-${name}`)).toBeTruthy();
  });
});

/**
 * Every list in this fixture comes back empty, which is exactly the state that
 * used to render one line of grey text on a blank background.
 */
describe('empty screens', () => {
  it('gives the balance screen an illustrated empty state', async () => {
    const { getByTestId } = await render(<BalanceScreen />);
    await waitFor(() => {
      expect(getByTestId('balance-empty')).toBeTruthy();
    });
  });

  it('gives the inbox an illustrated empty state', async () => {
    const { getByTestId } = await render(<SuggestionsScreen />);
    await waitFor(() => {
      expect(getByTestId('suggestions-empty')).toBeTruthy();
    });
  });

  it('gives a day with no chores an illustrated empty state', async () => {
    const { getByTestId } = await render(<CalendarScreen />);
    await waitFor(() => {
      expect(getByTestId('calendar-empty-day')).toBeTruthy();
    });
  });
});
