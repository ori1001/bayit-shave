import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { joinHouse } from '../../features/onboarding/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii } from '../../theme';

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
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={28} color={colors.ink} />
        <Text style={styles.title}>{t('onboarding.joinHouse')}</Text>
      </View>
      <Text style={styles.label}>{t('onboarding.inviteCodeLabel')}</Text>
      <TextInput value={inviteCode} onChangeText={setInviteCode} testID="invite-code-input" style={styles.input} />
      <Text style={styles.label}>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={name} onChangeText={setName} testID="join-name-input" style={styles.input} />
      {error && (
        <Text testID="join-house-error" style={styles.errorText}>
          {error}
        </Text>
      )}
      <AnimatedPressable
        onPress={handleSubmit}
        disabled={submitting || !inviteCode || !name}
        testID="join-house-submit"
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
