import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LogoMark, LOGO_GREEN, LOGO_SLATE } from '../Logo';
import { CategoryIcon } from '../CategoryIcon';
import { colors, spacing, radii, sectionColors, stateColors, MISSION_CATEGORIES, ICONS, tint } from '../../theme';

/**
 * One illustration per onboarding screen.
 *
 * Each takes `active` and animates only while its page is showing, so the
 * motion is seen rather than having already finished off-screen.
 *
 * Reduced motion is handled by the caller passing `animate={false}`, which
 * renders the final state immediately -- content is never withheld behind an
 * animation.
 */

interface IllustrationProps {
  active: boolean;
  animate?: boolean;
}

/** 01 — the two houses arrive from opposite edges and settle together. */
export function HousesIllustration({ active, animate = true }: IllustrationProps) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (active && animate) {
      progress.value = 0;
      progress.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 90 }));
    }
  }, [active, animate, progress]);

  const left = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * -70 }],
  }));
  const right = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * 70 }],
  }));

  return (
    <View style={styles.center}>
      <View style={styles.houseRow}>
        <Animated.View style={left}>
          <View style={[styles.house, { backgroundColor: LOGO_GREEN, height: 76 }]} />
        </Animated.View>
        <Animated.View style={right}>
          <View style={[styles.house, { backgroundColor: LOGO_SLATE, height: 92 }]} />
        </Animated.View>
      </View>
    </View>
  );
}

/** 02 — category icons drop in staggered, each with its point value. */
export function PointsIllustration({ active, animate = true }: IllustrationProps) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (active && animate) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    }
  }, [active, animate, progress]);

  const categories = MISSION_CATEGORIES.filter((c) => c !== 'other');

  return (
    <View style={styles.center}>
      <View style={styles.catGrid}>
        {categories.map((category, index) => (
          <StaggeredIcon key={category} category={category} index={index} progress={progress} />
        ))}
      </View>
    </View>
  );
}

function StaggeredIcon({
  category,
  index,
  progress,
}: {
  category: string;
  index: number;
  progress: { value: number };
}) {
  const style = useAnimatedStyle(() => {
    // Each icon owns a slice of the 0..1 progress, so they land in sequence.
    const start = index * 0.09;
    const local = Math.min(1, Math.max(0, (progress.value - start) / 0.35));
    return {
      opacity: local,
      transform: [{ translateY: (1 - local) * -16 }, { scale: 0.7 + local * 0.3 }],
    };
  });

  return (
    <Animated.View style={style}>
      <CategoryIcon category={category} size={26} />
    </Animated.View>
  );
}

/** 03 — uneven bars animate until level. The core promise, shown. */
export function BalanceIllustration({ active, animate = true }: IllustrationProps) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (active && animate) {
      progress.value = 0;
      progress.value = withDelay(200, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    }
  }, [active, animate, progress]);

  // Start uneven, end level -- the whole point of the screen.
  const bars = [
    { from: 0.2, to: 0.8 },
    { from: 0.9, to: 0.78 },
    { from: 0.45, to: 0.82 },
  ];

  return (
    <View style={styles.center}>
      <View style={styles.barStack}>
        {bars.map((bar, i) => (
          <AnimatedBar key={i} from={bar.from} to={bar.to} progress={progress} />
        ))}
      </View>
    </View>
  );
}

function AnimatedBar({ from, to, progress }: { from: number; to: number; progress: { value: number } }) {
  const style = useAnimatedStyle(() => ({
    width: `${(from + (to - from) * progress.value) * 100}%`,
  }));

  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, style]} />
    </View>
  );
}

/** 04 — three request cards fan out from centre. */
export function FlexibilityIllustration({ active, animate = true }: IllustrationProps) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (active && animate) {
      progress.value = 0;
      progress.value = withDelay(120, withSpring(1, { damping: 15, stiffness: 110 }));
    }
  }, [active, animate, progress]);

  const cards = [
    { icon: ICONS.swap, color: sectionColors.calendar, angle: -12 },
    { icon: ICONS.unavailability, color: sectionColors.inbox, angle: 0 },
    { icon: ICONS.awaiting, color: stateColors.pending, angle: 12 },
  ];

  return (
    <View style={styles.center}>
      <View style={styles.cardFan}>
        {cards.map((card, i) => (
          <FanCard key={i} {...card} index={i} progress={progress} />
        ))}
      </View>
    </View>
  );
}

function FanCard({
  icon,
  color,
  angle,
  index,
  progress,
}: {
  icon: keyof typeof ICONS | string;
  color: string;
  angle: number;
  index: number;
  progress: { value: number };
}) {
  const style = useAnimatedStyle(() => {
    const start = index * 0.14;
    const local = Math.min(1, Math.max(0, (progress.value - start) / 0.6));
    return {
      opacity: local,
      transform: [{ rotate: `${angle * local}deg` }, { translateY: (1 - local) * 20 }],
    };
  });

  return (
    <Animated.View style={[styles.fanCard, { borderColor: color }, style]}>
      <Ionicons name={icon as never} size={22} color={color} />
    </Animated.View>
  );
}

/** 05 — the destination. Logo settles, buttons rise last. */
export function SetupIllustration({ active, animate = true }: IllustrationProps) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (active && animate) {
      progress.value = 0;
      progress.value = withSpring(1, { damping: 15, stiffness: 120 });
    }
  }, [active, animate, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.85 + progress.value * 0.15 }],
  }));

  return (
    <View style={styles.center}>
      <Animated.View style={style}>
        <LogoMark size={92} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  houseRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  house: {
    width: 58,
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    maxWidth: 220,
  },
  barStack: {
    width: 200,
    gap: spacing.md,
  },
  barTrack: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: stateColors.done,
  },
  cardFan: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fanCard: {
    width: 62,
    height: 76,
    borderRadius: radii.md,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
