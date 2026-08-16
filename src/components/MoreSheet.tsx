import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, spacing, radii, sectionColors, ICONS, tint } from '../theme';

interface MoreSheetProps {
  visible: boolean;
  onClose: () => void;
  houseId: string;
  isAdmin: boolean;
}

/**
 * Everything that used to be a full-width button on Today.
 *
 * Slides up as a layer rather than replacing the screen — vertical motion means
 * "on top of", which keeps the mental model that you have not navigated away.
 */
export function MoreSheet({ visible, onClose, houseId, isAdmin }: MoreSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const items = [
    {
      key: 'timeOff',
      icon: ICONS.unavailability,
      color: sectionColors.unavailability,
      label: t('more.timeOff'),
      go: () => router.push({ pathname: '/unavailability/suggest', params: { houseId } }),
    },
    ...(isAdmin
      ? [
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
        ]
      : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={styles.backdropWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} testID="more-backdrop" accessibilityLabel={t('more.close')} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(280)}
        exiting={SlideOutDown.duration(220)}
        style={styles.sheet}
        testID="more-sheet"
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('more.title')}</Text>
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
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontWeight: '700',
    color: colors.ink,
    fontSize: 15,
  },
});
