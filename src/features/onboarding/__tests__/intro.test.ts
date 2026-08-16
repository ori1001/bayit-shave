import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenIntro, markIntroSeen } from '../intro';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('intro flag', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is unseen on a fresh install', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    expect(await hasSeenIntro()).toBe(false);
  });

  it('is seen once marked', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('1');
    expect(await hasSeenIntro()).toBe(true);
  });

  it('treats unreadable storage as seen, so a fault cannot trap a returning user in onboarding', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage unavailable'));
    expect(await hasSeenIntro()).toBe(true);
  });

  it('does not throw when the flag cannot be written', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('full'));
    await expect(markIntroSeen()).resolves.toBeUndefined();
  });
});
