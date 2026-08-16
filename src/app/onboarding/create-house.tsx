import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      <View style={styles.screen} testID="create-house-success">
        <View style={styles.header}>
          <Ionicons name="checkmark-circle" size={28} color={colors.sage} />
          <Text style={styles.title}>{t('onboarding.houseCreated')}</Text>
        </View>
        <Text style={styles.label}>{t('onboarding.shareCodeIntro')}</Text>
        <View style={styles.codeBox}>
          <Text testID="invite-code-value" style={styles.codeText} selectable>
            {inviteCode}
          </Text>
        </View>
        <AnimatedPressable onPress={handleCopyCode} testID="copy-invite-code" style={styles.copyButton}>
          <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={18} color={colors.ink} />
          <Text style={styles.copyButtonText}>{t(copied ? 'onboarding.codeCopied' : 'onboarding.copyCode')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => router.replace('/')} testID="create-house-continue" style={styles.submitButton}>
          <Text style={styles.submitButtonText}>{t('onboarding.goToHouse')}</Text>
        </AnimatedPressable>
      </View>
    );
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
    color: colors.ink,
  },
  errorText: {
    color: colors.rose,
  },
  codeBox: {
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
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
    padding: spacing.md,
  },
  copyButtonText: {
    color: colors.ink,
    fontWeight: '700',
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
