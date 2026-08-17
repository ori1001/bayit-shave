import { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  AccessibilityInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import {
  HousesIllustration,
  PointsIllustration,
  BalanceIllustration,
  FlexibilityIllustration,
  SetupIllustration,
} from '../../components/onboarding/Illustrations';
import { markIntroSeen } from '../../features/onboarding/intro';
import * as haptics from '../../lib/haptics';
import { colors, spacing, radii, type, sectionColors, ICONS, chevronNext } from '../../theme';

const PAGES = [
  { key: 's1', Illustration: HousesIllustration },
  { key: 's2', Illustration: PointsIllustration },
  { key: 's3', Illustration: BalanceIllustration },
  { key: 's4', Illustration: FlexibilityIllustration },
  { key: 's5', Illustration: SetupIllustration },
] as const;

export default function IntroScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useState(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
    return undefined;
  });

  const isLast = page === PAGES.length - 1;

  async function finish() {
    await markIntroSeen();
    router.replace('/');
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(PAGES.length - 1, index));
    // ScrollView lays out LTR internally even under RTL, so the offset is
    // always measured from the start edge -- no mirroring needed here.
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setPage(clamped);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) {
      setPage(next);
      haptics.select();
    }
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + spacing.xl }]}>
      {!isLast && (
        <AnimatedPressable onPress={finish} testID="intro-skip" style={[styles.skip, { top: insets.top + spacing.sm }]}>
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </AnimatedPressable>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        testID="intro-pager"
      >
        {PAGES.map(({ key, Illustration }, index) => (
          <View key={key} style={[styles.page, { width }]} testID={`intro-page-${index + 1}`}>
            <Illustration active={page === index} animate={!reduceMotion} />
            <Text style={styles.title}>{t(`onboarding.${key}Title`)}</Text>
            <Text style={styles.body}>{t(`onboarding.${key}Body`)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {PAGES.map((p, index) => (
          <AnimatedPressable
            key={p.key}
            onPress={() => goTo(index)}
            testID={`intro-dot-${index + 1}`}
            accessibilityLabel={`${index + 1}`}
            style={[styles.dot, page === index && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        {isLast ? (
          <AnimatedPressable onPress={finish} testID="intro-get-started" style={styles.primary}>
            <Ionicons name={ICONS.add} size={18} color={colors.cream} />
            <Text style={styles.primaryText}>{t('onboarding.getStarted')}</Text>
          </AnimatedPressable>
        ) : (
          <AnimatedPressable onPress={() => goTo(page + 1)} testID="intro-next" style={styles.primary}>
            <Text style={styles.primaryText}>{t('onboarding.next')}</Text>
            <Ionicons
              // Points the natural forward way in both directions -- a fixed
              // chevron would mean "back" in Hebrew.
              name={chevronNext()}
              size={18}
              color={colors.cream}
            />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skip: {
    position: 'absolute',
    end: spacing.lg,
    zIndex: 2,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  skipText: {
    ...type.label,
    color: colors.textMuted,
    fontWeight: '700',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...type.title,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: sectionColors.templates,
  },
  actions: {
    paddingHorizontal: spacing.xl,
  },
  primary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
  },
  primaryText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
});
