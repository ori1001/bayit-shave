import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback, wrapped so it can never break the action it accompanies.
 *
 * Haptics are absent on web, on most emulators, and on devices where the user
 * has turned them off. A missing motor must not surface as an error on an
 * action that otherwise succeeded, so every call here is fire-and-forget:
 * callers do not await, and nothing they do can fail because of a haptic.
 */

function safe(run: () => Promise<void>): void {
  if (Platform.OS === 'web') {
    return;
  }
  run().catch(() => {
    // No haptic hardware, or the user disabled it. Not an error.
  });
}

/**
 * Ordinary press.
 *
 * Light on iOS, where the Taptic Engine renders it clearly. Android's Light
 * impact is a very short, very weak buzz that most phones render as nothing at
 * all, so it gets Medium -- matching the *perceived* strength across platforms
 * rather than the nominal one.
 */
export function tap(): void {
  safe(() =>
    Haptics.impactAsync(
      Platform.OS === 'android' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    )
  );
}

/** A decision with consequences: approving, rejecting, assigning. */
export function decide(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Something completed: a chore done, a balance run finished. */
export function success(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Something failed. Distinguishable from success by feel alone. */
export function error(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Light repeated feedback -- swiping onboarding, changing a selection. */
export function select(): void {
  safe(() => Haptics.selectionAsync());
}
