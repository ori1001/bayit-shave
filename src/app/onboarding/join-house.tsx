import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { joinHouse } from '../../features/onboarding/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii, type, sectionColors, tint } from '../../theme';

export default function JoinHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !submitting && !!inviteCode && !!name;

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
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: tint(sectionColors.templates, '1F') }]}>
          <Ionicons name="people-outline" size={24} color={sectionColors.templates} />
        </View>
        <Text style={styles.title}>{t('onboarding.joinHouse')}</Text>
      </View>
      <Text style={styles.label}>{t('onboarding.inviteCodeLabel')}</Text>
      <TextInput
        value={inviteCode}
        onChangeText={setInviteCode}
        testID="invite-code-input"
        autoCapitalize="characters"
        style={[styles.input, styles.codeInput]}
      />
      <Text style={styles.label}>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={name} onChangeText={setName} testID="join-name-input" style={styles.input} />
      {error && (
        <Text testID="join-house-error" style={styles.errorText}>
          {error}
        </Text>
      )}
      <AnimatedPressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="join-house-submit"
        style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
      >
        <Text style={styles.submitButtonText}>{t('onboarding.submit')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...type.heading,
    color: colors.ink,
    flex: 1,
  },
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
  codeInput: {
    ...type.heading,
    letterSpacing: 3,
    textAlign: 'center',
    color: colors.ink,
  },
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
