import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { suggestUnavailability } from '../../features/requests/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { DateRangeField } from '../../components/DatePicker';
import { colors, spacing, radii } from '../../theme';

export default function SuggestUnavailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await suggestUnavailability(houseId, periodStart, periodEnd, reason || undefined);
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="airplane-outline" size={26} color={colors.violet} />
        <Text style={styles.title}>{t('unavailability.title')}</Text>
      </View>

      <Text style={styles.label}>{t('unavailability.periodStartLabel')}</Text>
      {/* One grid takes both ends: first tap sets the start, second the end. */}
      <DateRangeField
        start={periodStart}
        end={periodEnd}
        onChange={(from, to) => {
          setPeriodStart(from);
          setPeriodEnd(to);
        }}
        label={t('unavailability.periodStartLabel')}
        testID="unavailability-range"
      />

      <Text style={styles.label}>{t('unavailability.reasonLabel')}</Text>
      <TextInput value={reason} onChangeText={setReason} testID="unavailability-reason-input" style={styles.input} />

      {error && (
        <Text testID="unavailability-error" style={styles.errorText}>
          {error}
        </Text>
      )}

      <AnimatedPressable onPress={handleSubmit} disabled={submitting || !periodStart || !periodEnd} testID="unavailability-submit" style={styles.submitButton}>
        <Text style={styles.submitButtonText}>{t('unavailability.submit')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    backgroundColor: colors.violet,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.surface,
    fontWeight: '800',
  },
});
