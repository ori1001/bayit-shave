import AsyncStorage from '@react-native-async-storage/async-storage';

const INTRO_SEEN_KEY = 'bayit-shave:intro-seen';

/**
 * Whether the intro has already been shown on this install.
 *
 * Stored locally rather than on the member row on purpose: the intro explains
 * the app, not the account, and it must be answerable before anyone has signed
 * in. A reinstall shows it again, which is acceptable for five skippable
 * screens.
 *
 * Defaults to "seen" if storage cannot be read, so a storage fault can never
 * trap a returning user in onboarding on every launch.
 */
export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Worst case the intro shows once more; not worth surfacing.
  }
}
