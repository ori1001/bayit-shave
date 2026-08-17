import { useEffect, useState } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { suggestUnavailability } from '../../features/requests/api';
import { getMyMembership } from '../../features/missions/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { DateRangeField } from '../../components/DatePicker';
import { Screen } from '../../components/Screen';
import { colors, spacing, radii, type, sectionColors, ICONS } from '../../theme';

export default function SuggestUnavailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!houseId) {
      return;
    }
    getMyMembership(houseId)
      .then((membership) => setIsAdmin(membership?.role === 'admin'))
      .catch(() => {});
  }, [houseId]);

  const canSubmit = !submitting && !!periodStart && !!periodEnd;

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
    <Screen
      section="unavailability"
      title={t('unavailability.title')}
      icon={ICONS.unavailability}
      tab="more"
      houseId={houseId}
      isAdmin={isAdmin}
      scroll
    >
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

      <AnimatedPressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="unavailability-submit"
        style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
      >
        <Ionicons name={ICONS.unavailability} size={20} color={colors.surface} />
        <Text style={styles.submitButtonText}>{t('unavailability.submit')}</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.label,
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
    ...type.body,
    color: colors.ink,
  },
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: sectionColors.unavailability,
    borderRadius: radii.lg,
    minHeight: 52,
    marginTop: spacing.sm,
  },
  submitButtonText: {
    ...type.bodyStrong,
    fontWeight: '800',
    color: colors.surface,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
