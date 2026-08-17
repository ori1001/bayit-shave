import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  inferDeviceLanguage,
  resolveInitialLanguage,
  applyRTLForLanguage,
  readStoredLanguage,
  storeLanguage,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
} from '../language';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

const mockLocales = (locales: unknown[]) => (Localization.getLocales as jest.Mock).mockReturnValue(locales);

describe('inferDeviceLanguage', () => {
  it('picks Hebrew when the device region is Israel, even on an English phone', () => {
    mockLocales([{ languageCode: 'en', regionCode: 'IL' }]);
    expect(inferDeviceLanguage()).toBe('he');
  });

  it('picks Hebrew when the device language is Hebrew, wherever the phone is', () => {
    mockLocales([{ languageCode: 'he', regionCode: 'US' }]);
    expect(inferDeviceLanguage()).toBe('he');
  });

  it('accepts the legacy "iw" code for Hebrew', () => {
    mockLocales([{ languageCode: 'iw', regionCode: 'US' }]);
    expect(inferDeviceLanguage()).toBe('he');
  });

  it('picks English for a region and language with no Hebrew signal', () => {
    mockLocales([{ languageCode: 'fr', regionCode: 'FR' }]);
    expect(inferDeviceLanguage()).toBe('en');
  });

  it('picks English for an English phone outside Israel', () => {
    mockLocales([{ languageCode: 'en', regionCode: 'US' }]);
    expect(inferDeviceLanguage()).toBe('en');
  });

  it('falls back to Hebrew when the device reports no locale at all', () => {
    mockLocales([]);
    expect(inferDeviceLanguage()).toBe('he');
  });

  it('is what the synchronous bootstrap resolves to', () => {
    mockLocales([{ languageCode: 'en', regionCode: 'IL' }]);
    expect(resolveInitialLanguage()).toBe(inferDeviceLanguage());
  });
});

describe('stored language', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is null before the user has ever chosen', async () => {
    await expect(readStoredLanguage()).resolves.toBeNull();
  });

  it('round-trips a chosen language', async () => {
    await storeLanguage('en');
    await expect(readStoredLanguage()).resolves.toBe('en');
    await expect(AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).resolves.toBe('en');
  });

  it('ignores a stored value that is not a language the app ships', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon');
    await expect(readStoredLanguage()).resolves.toBeNull();
  });
});

describe('isSupportedLanguage', () => {
  it('accepts the shipped languages and nothing else', () => {
    expect(isSupportedLanguage('he')).toBe(true);
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
  });
});

describe('applyRTLForLanguage', () => {
  let forceRTLSpy: jest.SpyInstance;
  let allowRTLSpy: jest.SpyInstance;

  beforeEach(() => {
    forceRTLSpy = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    allowRTLSpy = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forces RTL on for Hebrew when not already RTL', () => {
    Object.defineProperty(I18nManager, 'isRTL', { value: false, configurable: true });
    const changed = applyRTLForLanguage('he');
    expect(allowRTLSpy).toHaveBeenCalledWith(true);
    expect(forceRTLSpy).toHaveBeenCalledWith(true);
    expect(changed).toBe(true);
  });

  it('forces RTL off for English when currently RTL', () => {
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    const changed = applyRTLForLanguage('en');
    expect(forceRTLSpy).toHaveBeenCalledWith(false);
    expect(changed).toBe(true);
  });

  it('does nothing when the direction is already correct', () => {
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    const changed = applyRTLForLanguage('he');
    expect(forceRTLSpy).not.toHaveBeenCalled();
    expect(changed).toBe(false);
  });
});
