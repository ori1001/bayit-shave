import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { createHouse } from '../../features/onboarding/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii, type, sectionColors, stateColors, tint } from '../../theme';

export default function CreateHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [houseName, setHouseName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const padding = { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl };
  const canSubmit = !submitting && !!houseName && !!adminName;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      // The invite code only ever comes back here. Hold it and show it --
      // without it no housemate can join, since nothing else surfaces it.
      const { house } = await createHouse(houseName, adminName);
      setInviteCode(house.invite_code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyCode() {
    if (!inviteCode) {
      return;
    }
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (inviteCode) {
    return (
      <View style={[styles.screen, padding]} testID="create-house-success">
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: tint(stateColors.done, '1F') }]}>
            <Ionicons name="checkmark-circle" size={26} color={stateColors.done} />
          </View>
          <Text style={styles.title}>{t('onboarding.houseCreated')}</Text>
        </View>
        <Text style={styles.label}>{t('onboarding.shareCodeIntro')}</Text>
        <View style={styles.codeBox}>
          <Text testID="invite-code-value" style={styles.codeText} selectable>
            {inviteCode}
          </Text>
        </View>
        <AnimatedPressable onPress={handleCopyCode} testID="copy-invite-code" style={styles.copyButton}>
          <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={20} color={colors.ink} />
          <Text style={styles.copyButtonText}>{t(copied ? 'onboarding.codeCopied' : 'onboarding.copyCode')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => router.replace('/')} testID="create-house-continue" style={styles.submitButton}>
          <Text style={styles.submitButtonText}>{t('onboarding.goToHouse')}</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, padding]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: tint(sectionColors.today, '24') }]}>
          <Ionicons name="home-outline" size={24} color={colors.ink} />
        </View>
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
        disabled={!canSubmit}
        testID="create-house-submit"
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
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  codeBox: {
    borderWidth: 1.5,
    borderColor: sectionColors.today,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: tint(sectionColors.today, '14'),
  },
  codeText: {
    ...type.display,
    letterSpacing: 6,
    color: colors.ink,
  },
  copyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
  },
  copyButtonText: {
    ...type.bodyStrong,
    color: colors.ink,
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
