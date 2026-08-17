import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he.json';
import en from './locales/en.json';
import {
  resolveInitialLanguage,
  applyRTLForLanguage,
  readStoredLanguage,
  storeLanguage,
  type SupportedLanguage,
} from './language';

const initialLanguage = resolveInitialLanguage();
applyRTLForLanguage(initialLanguage);

i18n.use(initReactI18next).init({
  lng: initialLanguage,
  fallbackLng: 'he',
  resources: {
    he: { translation: he },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

/**
 * A stored choice overrides the inferred language.
 *
 * i18next has to be initialised synchronously so the first frame has strings,
 * but AsyncStorage cannot be read synchronously. So the app opens on the
 * device-inferred language and swaps a tick later if the user has chosen
 * otherwise -- imperceptible in practice, and it means a saved preference never
 * needs a second launch to take effect.
 */
export const languageReady: Promise<SupportedLanguage> = readStoredLanguage().then((stored) => {
  if (stored && stored !== i18n.language) {
    applyRTLForLanguage(stored);
    i18n.changeLanguage(stored);
    return stored;
  }
  return (i18n.language as SupportedLanguage) ?? initialLanguage;
});

/**
 * Switches language for good.
 *
 * Returns whether the writing direction flipped, which the caller has to
 * surface: text changes on the spot, but React Native only applies a layout
 * direction change on the next launch.
 */
export async function setLanguage(language: SupportedLanguage): Promise<{ needsRestart: boolean }> {
  const directionChanged = applyRTLForLanguage(language);
  await i18n.changeLanguage(language);
  await storeLanguage(language);
  return { needsRestart: directionChanged };
}

export default i18n;
