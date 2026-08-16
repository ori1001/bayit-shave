import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as haptics from '../haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

describe('haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });

  it('does nothing on web, where there is no haptic hardware', () => {
    Platform.OS = 'web';

    haptics.tap();
    haptics.success();
    haptics.error();

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('uses Light for ordinary presses, so repeated taps do not become noise', () => {
    haptics.tap();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('uses Medium for decisions with consequences', () => {
    haptics.decide();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
  });

  it('distinguishes success from error by feedback type', () => {
    haptics.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');

    haptics.error();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('swallows a failing haptic rather than breaking the action it accompanies', async () => {
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(new Error('no motor'));

    // Must not throw synchronously, and must not produce an unhandled rejection.
    expect(() => haptics.success()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('is fire-and-forget: callers get nothing to await', () => {
    expect(haptics.tap()).toBeUndefined();
    expect(haptics.success()).toBeUndefined();
  });
});
