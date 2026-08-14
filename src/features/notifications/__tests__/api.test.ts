import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } },
}));

jest.mock('../../../lib/supabase', () => {
  const builder: Record<string, jest.Mock> = {
    eq: jest.fn(() => Promise.resolve({ error: null })),
  };
  builder.update = jest.fn(() => builder);
  return { supabase: { from: jest.fn(() => builder) } };
});

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  it('returns null on web without touching the notifications API', async () => {
    Platform.OS = 'web';

    expect(await registerForPushNotifications('m1')).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns null when the member declines the permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    expect(await registerForPushNotifications('m1')).toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('does not re-prompt when permission was already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[abc]' });

    expect(await registerForPushNotifications('m1')).toBe('ExponentPushToken[abc]');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith('members');
  });

  it('returns null when the device cannot mint a token, rather than throwing', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('no play services'));

    expect(await registerForPushNotifications('m1')).toBeNull();
  });
});
