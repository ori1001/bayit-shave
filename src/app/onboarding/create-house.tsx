import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createHouse } from '../../features/onboarding/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii } from '../../theme';

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
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="home-outline" size={28} color={colors.ink} />
        <Text style={styles.title}>{t('onboarding.createHouse')}</Text>
      </View>
      <Text style={styles.label}>{t('onboarding.houseNameLabel')}</Text>
      <TextInput value={houseName} onChangeText={setHouseName} testID="house-name-input" style={styles.input} />
      <Text style={styles.label}>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={adminName} onChangeText={setAdminName} testID="admin-name-input" style={styles.input} />
      {error && (
        <Text testID="create-house-error" style={styles.errorText}>
          {error}
        </Text>
      )}
      <AnimatedPressable
        onPress={handleSubmit}
        disabled={submitting || !houseName || !adminName}
        testID="create-house-submit"
        style={styles.submitButton}
      >
        <Text style={styles.submitButtonText}>{t('onboarding.submit')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
});
