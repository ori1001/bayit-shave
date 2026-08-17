import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radii, type, sectionColors, ICONS, tint } from '../theme';

interface MoreSheetProps {
  visible: boolean;
  onClose: () => void;
  houseId: string;
  /** Shown as a badge. The destinations themselves are listed for everyone. */
  isAdmin?: boolean;
}

/**
 * Everything that used to be a full-width button on Today.
 *
 * Slides up as a layer rather than replacing the screen — vertical motion means
 * "on top of", which keeps the mental model that you have not navigated away.
 */
export function MoreSheet({ visible, onClose, houseId, isAdmin = false }: MoreSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Everything is listed for everyone. Both screens already render a read-only
  // view for a member (with a "the admin decides this" notice), but the entries
  // were hidden unless isAdmin -- so a member could not see the house's rules at
  // all, and an admin whose role had not loaded yet saw a sheet with one item in
  // it and no way to reach their own settings. The screens do the gating.
  const items = [
    {
      key: 'timeOff',
      icon: ICONS.unavailability,
      color: sectionColors.unavailability,
      label: t('more.timeOff'),
      go: () => router.push({ pathname: '/unavailability/suggest', params: { houseId } }),
    },
    {
      key: 'recurring',
      icon: ICONS.templates,
      color: sectionColors.templates,
      label: t('more.recurring'),
      go: () => router.push({ pathname: '/missions/templates', params: { houseId } }),
    },
    {
      key: 'settings',
      icon: ICONS.settings,
      color: sectionColors.settings,
      label: t('more.settings'),
      go: () => router.push({ pathname: '/settings', params: { houseId } }),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={styles.backdropWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} testID="more-backdrop" accessibilityLabel={t('more.close')} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(280)}
        exiting={SlideOutDown.duration(220)}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        testID="more-sheet"
      >
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('more.title')}</Text>
          {/* Being the admin changes what half these screens let you do, and
              nothing anywhere said whether you were one. */}
          {isAdmin && (
            <View style={styles.adminBadge} testID="more-admin-badge">
              <Ionicons name={ICONS.admin} size={13} color={sectionColors.settings} />
              <Text style={styles.adminBadgeText}>{t('more.youAreAdmin')}</Text>
            </View>
          )}
        </View>
        {items.map((item) => (
          <AnimatedPressable
            key={item.key}
            onPress={() => {
              onClose();
              item.go();
            }}
            testID={`more-${item.key}`}
            style={styles.item}
          >
            <View style={[styles.itemIcon, { backgroundColor: tint(item.color, '22') }]}>
              <Ionicons name={item.icon} size={18} color={item.color} />
            </View>
            <Text style={styles.itemLabel}>{item.label}</Text>
          </AnimatedPressable>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(38,51,46,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    ...type.heading,
    color: colors.ink,
    flex: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: tint(sectionColors.settings, '1F'),
  },
  adminBadgeText: {
    ...type.caption,
    fontWeight: '800',
    color: sectionColors.settings,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    ...type.subheading,
    color: colors.ink,
  },
});
