import { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radii, spacing } from '../theme';

/**
 * Shared motion primitives.
 *
 * Durations are deliberately short (180-320ms). Anything slower starts to feel
 * like latency rather than polish, and this app is used in quick bursts while
 * someone is mid-chore.
 */

interface FadeInProps {
  children: React.ReactNode;
  /** Stagger index — each step delays the entrance by 45ms. */
  index?: number;
  from?: 'bottom' | 'top' | 'none';
  /**
   * Render immediately, with no entrance at all.
   *
   * Set when the content came from cache. Coming back to a tab, the rows are
   * already known, and re-running a staggered rise underneath the screen's own
   * transition is what made switching tabs look unsettled.
   */
  skip?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Entrance animation: content rises and fades in rather than popping. */
export function FadeIn({ children, index = 0, from = 'bottom', skip = false, style, testID }: FadeInProps) {
  const progress = useSharedValue(skip ? 1 : 0);

  useEffect(() => {
    if (skip) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(index * 45, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [index, progress, skip]);

  const offset = from === 'none' ? 0 : from === 'top' ? -12 : 12;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offset }],
  }));

  return (
    <Animated.View testID={testID} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

/**
 * Shimmering placeholder block.
 *
 * Screens previously rendered an empty background while loading, which is
 * indistinguishable from a hang -- the thing that made the app feel broken.
 */
export function Skeleton({ height = 64, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View style={[styles.skeleton, { height }, style, animatedStyle]} />;
}

/** Full-screen loading state built from skeleton rows. */
export function LoadingScreen({ rows = 4, testID = 'loading-screen' }: { rows?: number; testID?: string }) {
  const insets = useSafeAreaInsets();

  return (
    // Padded like a real screen, so the skeleton sits where the content will
    // rather than jumping down a notch's worth when the data arrives.
    <View style={[styles.loadingScreen, { paddingTop: insets.top + spacing.xl }]} testID={testID}>
      <Skeleton height={32} style={{ width: '55%' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={72} />
      ))}
    </View>
  );
}

/**
 * Branded loading state for the app's entry screen.
 *
 * Skeleton rows suit a content list, but the very first frame after the splash
 * has no content to stand in for -- a blank background there is exactly what
 * reads as "the app didn't load". A breathing logo carries the brand across
 * that gap instead.
 */
export function BrandedLoading({
  children,
  testID = 'branded-loading',
}: {
  children: React.ReactNode;
  testID?: string;
}) {
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [breath]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + breath.value * 0.45,
    transform: [{ scale: 0.97 + breath.value * 0.03 }],
  }));

  return (
    <View style={styles.branded} testID={testID}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </View>
  );
}

/**
 * Draws attention to a value that just changed — a quick scale pop.
 * Used when points are credited so completing a chore feels like it landed.
 */
export function Pop({ trigger, children, style }: { trigger: unknown; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const first = useSharedValue(true);

  useEffect(() => {
    if (first.value) {
      first.value = false;
      return;
    }
    scale.value = withSequence(
      withSpring(1.12, { damping: 12, stiffness: 320 }),
      withSpring(1, { damping: 14, stiffness: 260 })
    );
  }, [trigger, scale, first]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.border,
    borderRadius: radii.md,
    width: '100%',
  },
  loadingScreen: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  branded: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
