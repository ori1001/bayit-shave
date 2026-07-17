import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import { resolveInitialLanguage, applyRTLForLanguage } from '../language';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

describe('resolveInitialLanguage', () => {
  it('defaults to Hebrew when the device locale is not English', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'fr' }]);
    expect(resolveInitialLanguage()).toBe('he');
  });

  it('picks English when the device locale is English', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en' }]);
    expect(resolveInitialLanguage()).toBe('en');
  });

  it('defaults to Hebrew when locale detection returns nothing', () => {
    (Localization.getLocales as jest.Mock).mockReturnValue([]);
    expect(resolveInitialLanguage()).toBe('he');
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
