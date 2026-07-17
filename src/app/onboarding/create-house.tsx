import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { createHouse } from '../../features/onboarding/api';

export default function CreateHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseName, setHouseName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await createHouse(houseName, adminName);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text>{t('onboarding.houseNameLabel')}</Text>
      <TextInput value={houseName} onChangeText={setHouseName} testID="house-name-input" />
      <Text>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={adminName} onChangeText={setAdminName} testID="admin-name-input" />
      {error && <Text testID="create-house-error">{error}</Text>}
      <Button
        title={t('onboarding.submit')}
        onPress={handleSubmit}
        disabled={submitting || !houseName || !adminName}
        testID="create-house-submit"
      />
    </View>
  );
}
