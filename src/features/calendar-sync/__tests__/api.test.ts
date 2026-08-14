import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncMissionsToDeviceCalendar } from '../api';
import type { Mission } from '../../missions/api';

jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  createCalendarAsync: jest.fn(),
  createEventAsync: jest.fn(),
  updateEventAsync: jest.fn(),
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: { OWNER: 'owner' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(() => Promise.resolve()),
}));

function mission(id: string): Mission {
  return {
    id,
    house_id: 'h1',
    title: `Mission ${id}`,
    category: 'dishes',
    points: 10,
    proposed_points: null,
    proposed_due_date: null,
    proposed_assigned_to: null,
    proposed_by: null,
    due_date: '2026-08-20',
    assigned_to: 'm1',
    status: 'assigned',
    created_by: 'm1',
    assignment_mode: 'auto',
    approved_by: null,
    approved_at: null,
  };
}

describe('syncMissionsToDeviceCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Calendar.getCalendarsAsync as jest.Mock).mockResolvedValue([]);
    (Calendar.createCalendarAsync as jest.Mock).mockResolvedValue('cal-1');
    (Calendar.createEventAsync as jest.Mock).mockResolvedValue('evt-1');
  });

  it('returns null on web without asking for calendar permission', async () => {
    Platform.OS = 'web';

    expect(await syncMissionsToDeviceCalendar([mission('a')])).toBeNull();
    expect(Calendar.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns null when the permission is declined', async () => {
    (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    expect(await syncMissionsToDeviceCalendar([mission('a')])).toBeNull();
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it('creates an event the first time a mission is seen', async () => {
    const result = await syncMissionsToDeviceCalendar([mission('a')]);

    expect(result).toEqual({ created: 1, updated: 0 });
    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
  });

  it('updates rather than duplicating when the mission was already synced', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key.includes('mission-event-ids') ? JSON.stringify({ a: 'evt-existing' }) : 'cal-1')
    );
    (Calendar.getCalendarsAsync as jest.Mock).mockResolvedValue([{ id: 'cal-1', allowsModifications: true }]);
    (Calendar.updateEventAsync as jest.Mock).mockResolvedValue(undefined);

    const result = await syncMissionsToDeviceCalendar([mission('a')]);

    expect(result).toEqual({ created: 0, updated: 1 });
    expect(Calendar.updateEventAsync).toHaveBeenCalledWith('evt-existing', expect.any(Object));
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it('recreates the event when it was deleted on the device', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key.includes('mission-event-ids') ? JSON.stringify({ a: 'evt-gone' }) : 'cal-1')
    );
    (Calendar.getCalendarsAsync as jest.Mock).mockResolvedValue([{ id: 'cal-1', allowsModifications: true }]);
    (Calendar.updateEventAsync as jest.Mock).mockRejectedValue(new Error('not found'));

    const result = await syncMissionsToDeviceCalendar([mission('a')]);

    expect(result).toEqual({ created: 1, updated: 0 });
    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
  });
});
