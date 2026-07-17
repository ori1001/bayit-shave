import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { joinHouse } from '../../features/onboarding/api';

export default function JoinHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await joinHouse(inviteCode, name);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text>{t('onboarding.inviteCodeLabel')}</Text>
      <TextInput value={inviteCode} onChangeText={setInviteCode} testID="invite-code-input" />
      <Text>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={name} onChangeText={setName} testID="join-name-input" />
      {error && <Text testID="join-house-error">{error}</Text>}
      <Button
        title={t('onboarding.submit')}
        onPress={handleSubmit}
        disabled={submitting || !inviteCode || !name}
        testID="join-house-submit"
      />
    </View>
  );
}
