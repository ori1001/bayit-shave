import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

export const SUPPORTED_LANGUAGES = ['he', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'bayit_shave.language';

/** Regions the app treats as Hebrew-speaking. */
const HEBREW_REGIONS = ['IL', 'PS'];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * The language to open in when the user has never chosen one.
 *
 * Region comes first, language second. Someone living in Israel very often runs
 * their phone in English, and this app is used by a household in one place --
 * where you are predicts the shared language better than which UI language you
 * happen to have set. The device language is still honoured when it is Hebrew
 * (a Hebrew speaker abroad) and decides every other case.
 */
export function inferDeviceLanguage(): SupportedLanguage {
  const locale = Localization.getLocales()[0];
  if (!locale) {
    return 'he';
  }
  if (locale.languageCode === 'he' || locale.languageCode === 'iw') {
    return 'he';
  }
  if (locale.regionCode && HEBREW_REGIONS.includes(locale.regionCode)) {
    return 'he';
  }
  return 'en';
}

/**
 * Kept for the synchronous i18n bootstrap: storage cannot be read before the
 * first frame, so the app opens on the inferred language and corrects itself to
 * a stored choice a tick later.
 */
export function resolveInitialLanguage(): SupportedLanguage {
  return inferDeviceLanguage();
}

/** The language the user picked, or null if they never picked one. */
export async function readStoredLanguage(): Promise<SupportedLanguage | null> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    // A storage failure must not stop the app opening; the inferred language stands.
    return null;
  }
}

export async function storeLanguage(language: SupportedLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Same reasoning: the switch still applies to this session.
  }
}

/**
 * Returns true if the RTL direction actually changed. React Native only
 * applies a forceRTL change on the *next* app launch, not the current
 * render, so a caller switching language at runtime has to tell the user the
 * layout direction finishes changing after a restart. Text itself swaps
 * immediately, because that comes from i18next rather than from Yoga.
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
