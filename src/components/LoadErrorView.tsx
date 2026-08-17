import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, spacing, radii, type, tint } from '../theme';

interface LoadErrorViewProps {
  message?: string | null;
  onRetry: () => void;
  testID?: string;
}

/**
 * Shown when a screen's initial load fails. Without this the screens sat on a
 * blank background forever, which reads as the app failing to open.
 */
export function LoadErrorView({ message, onRetry, testID = 'load-error' }: LoadErrorViewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.screen} testID={testID}>
      <View style={styles.disc}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.rose} />
      </View>
      <Text style={styles.message}>{message || t('common.loadError')}</Text>
      <AnimatedPressable onPress={onRetry} testID={`${testID}-retry`} style={styles.retryButton}>
        <Ionicons name="refresh" size={20} color={colors.cream} />
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  disc: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(colors.rose, '14'),
    marginBottom: spacing.sm,
  },
  message: {
    ...type.body,
    textAlign: 'center',
    color: colors.textMuted,
    maxWidth: 320,
  },
  retryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  retryText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
});
