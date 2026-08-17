jest.mock('../missions/api', () => ({
  getMyMembership: jest.fn(() => Promise.resolve({ id: 'mem-1', role: 'admin' })),
  getHouseMembers: jest.fn(() => Promise.resolve([{ id: 'mem-1', name: 'Noa', role: 'admin' }])),
  getMonthMissions: jest.fn(() => Promise.resolve([{ id: 'm1' }])),
  getSuggestions: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../balance/api', () => ({
  getPointsPool: jest.fn(() => Promise.resolve([{ member_id: 'mem-1' }])),
  getOpenMissions: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../requests/api', () => ({
  getPendingSwapsForAdmin: jest.fn(() => Promise.resolve([])),
  getPendingUnavailability: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../settings/api', () => ({ getHouseSettings: jest.fn() }));
jest.mock('../templates/api', () => ({ getTemplates: jest.fn() }));

import { prefetchTabs, calendarKey, balanceKey, inboxKey, fetchCalendar } from '../tabs-data';
import { clearScreenData, peekScreenData } from '../../lib/screen-data';
import { getMonthMissions } from '../missions/api';

describe('prefetchTabs', () => {
  beforeEach(() => {
    clearScreenData();
    jest.clearAllMocks();
  });

  it('warms the same keys the calendar, balance and inbox screens read', async () => {
    const when = new Date(2026, 7, 17);
    prefetchTabs('house-1', when);
    // Let the three fire-and-forget fetches settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The prefetch and the screens must agree on the key exactly. If they ever
    // drift, the prefetch still "succeeds" -- it just fills a key nobody reads,
    // and every tab silently goes back to loading on first open.
    expect(peekScreenData(calendarKey('house-1', 2026, 8))).toMatchObject({ missions: [{ id: 'm1' }], isAdmin: true });
    expect(peekScreenData(balanceKey('house-1'))).toMatchObject({ pool: [{ member_id: 'mem-1' }] });
    expect(peekScreenData(inboxKey('house-1'))).toMatchObject({ items: [] });

    // The month it warms is the one the calendar screen opens on.
    expect(getMonthMissions).toHaveBeenCalledWith('house-1', 2026, 8);
  });

  it('never throws, so a speculative fetch cannot break the screen that triggered it', async () => {
    // Once, not permanently: jest.clearAllMocks() resets recorded calls but
    // leaves implementations in place, so a persistent rejection here would
    // follow the mock into every later test in the file.
    (getMonthMissions as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    expect(() => prefetchTabs('house-1')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The failed one is simply absent; the screen will fetch it on mount and
    // report the error itself.
    expect(peekScreenData(calendarKey('house-1', 2026, 8))).toBeUndefined();
  });
});

describe('shared fetchers', () => {
  it('builds the calendar payload the screen expects', async () => {
    const data = await fetchCalendar('house-1', 2026, 8);
    expect(data).toEqual({
      missions: [{ id: 'm1' }],
      members: [{ id: 'mem-1', name: 'Noa', role: 'admin' }],
      myMemberId: 'mem-1',
      isAdmin: true,
    });
  });
});
