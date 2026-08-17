import '../i18n';

import { Stack } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { colors } from '../theme';

/**
 * Screens that sit behind the bottom tab bar.
 *
 * These are siblings, not a hierarchy: moving between them is switching view,
 * not drilling in. The stack's default push animation slid the whole screen in
 * from the edge -- and because every one of them draws its own tab bar, the bar
 * slid out with the old screen and back in with the new one, which is what made
 * tab taps look like the page jumping rather than changing.
 *
 * A cross-fade fixes it without moving each screen into a route group: the two
 * tab bars are identical, so fading one into the other is invisible, and only
 * the content appears to change.
 */
const TAB_SCREENS = [
  'today',
  'calendar',
  'balance',
  'settings',
  'missions/suggestions',
  'missions/templates',
  'missions/suggest',
  'unavailability/suggest',
] as const;

export default function RootLayout() {
  return (
    // Every screen reads the insets to keep its header off the notch and its tab
    // bar off the home indicator, so the provider has to sit above the router.
    // initialWindowMetrics avoids the one-frame flash of zero insets on launch.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          // Short enough that it never feels like waiting, long enough to read
          // as a change rather than a cut.
          animationDuration: 180,
        }}
      >
        {TAB_SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} options={{ animation: 'fade' }} />
        ))}
        {/* Onboarding and sign-in keep the sliding push: those genuinely are
            steps forward through a sequence. */}
      </Stack>
    </SafeAreaProvider>
  );
}
