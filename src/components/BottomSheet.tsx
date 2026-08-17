import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radii, type } from '../theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testID?: string;
}

/**
 * A form layer over the current screen.
 *
 * Lists and forms used to share one scroll, so a screen whose job was showing
 * what exists was dominated by the controls for creating something new. A sheet
 * means those controls exist only while in use.
 *
 * Slides vertically on purpose: vertical motion reads as "on top of", so the
 * list stays visible behind and dismissing returns you exactly where you were.
 * Horizontal motion stays reserved for moving between siblings.
 */
export function BottomSheet({ visible, onClose, title, children, testID = 'bottom-sheet' }: BottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={styles.backdropWrap}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          testID={`${testID}-backdrop`}
          accessibilityLabel={t('more.close')}
        />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(280)}
        exiting={SlideOutDown.duration(220)}
        style={styles.sheet}
        testID={testID}
      >
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} testID={`${testID}-close`} accessibilityLabel={t('more.close')} hitSlop={10}>
            <Ionicons name="close-circle" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
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
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title: {
    ...type.heading,
    color: colors.ink,
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
});
