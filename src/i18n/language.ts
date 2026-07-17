import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

export const SUPPORTED_LANGUAGES = ['he', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function resolveInitialLanguage(): SupportedLanguage {
  const deviceTag = Localization.getLocales()[0]?.languageCode;
  return deviceTag === 'en' ? 'en' : 'he';
}

/**
 * Returns true if the RTL direction actually changed. React Native only
 * applies a forceRTL change on the *next* app reload, not the current
 * render — callers that change language at runtime (not just at boot)
 * must trigger a reload (e.g. expo-updates' reloadAsync) when this
 * returns true.
 */
export function applyRTLForLanguage(lang: SupportedLanguage): boolean {
  const shouldBeRTL = lang === 'he';
  const changed = I18nManager.isRTL !== shouldBeRTL;
  if (changed) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
  }
  return changed;
}
