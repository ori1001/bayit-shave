import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { suggestUnavailability } from '../../features/requests/api';

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
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('unavailability.title')}</Text>

      <Text>{t('unavailability.periodStartLabel')}</Text>
      <TextInput
        value={periodStart}
        onChangeText={setPeriodStart}
        placeholder="2026-08-01"
        testID="unavailability-start-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <Text>{t('unavailability.periodEndLabel')}</Text>
      <TextInput
        value={periodEnd}
        onChangeText={setPeriodEnd}
        placeholder="2026-08-05"
        testID="unavailability-end-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <Text>{t('unavailability.reasonLabel')}</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        testID="unavailability-reason-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      {error && <Text testID="unavailability-error">{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || !periodStart || !periodEnd}
        testID="unavailability-submit"
        style={{ backgroundColor: '#4C7A8C', borderRadius: 14, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>{t('unavailability.submit')}</Text>
      </Pressable>
    </View>
  );
}
