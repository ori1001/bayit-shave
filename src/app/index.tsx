import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { signUp, signIn } from '../features/auth/api';
import { getMyHouseId } from '../features/missions/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { colors, spacing, radii } from '../theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'signUp' | 'signIn'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setHasSession(!!data.session))
      // A rejection here (no network on launch, storage read failure) would
      // otherwise leave hasSession null forever, i.e. a permanently blank app.
      .catch(() => setHasSession(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (hasSession) {
      getMyHouseId()
        .then((houseId) => {
          if (houseId) {
            router.replace('/today');
          }
        })
        .catch(() => {
          // no-op: if the house check fails, the user just sees the create/join buttons
        });
    }
  }, [hasSession]);

  async function handleAuthSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  if (hasSession === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!hasSession) {
    return (
      <View style={styles.screen}>
        <View style={styles.brand}>
          <Ionicons name="home-outline" size={36} color={colors.ink} />
          <Text style={styles.appName}>{t('onboarding.appName')}</Text>
        </View>
        <Text style={styles.tagline}>{t('onboarding.tagline')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailLabel')}
          testID="auth-email-input"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordLabel')}
          testID="auth-password-input"
          secureTextEntry
          style={styles.input}
        
          placeholderTextColor={colors.textMuted}
        />
        {error && (
          <Text testID="auth-error" style={styles.errorText}>
            {error}
          </Text>
        )}
        <AnimatedPressable
          onPress={handleAuthSubmit}
          disabled={submitting || !email || !password}
          testID="auth-submit"
          style={styles.primaryButton}
        >
          <Ionicons name={mode === 'signUp' ? 'person-add-outline' : 'log-in-outline'} size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t(mode === 'signUp' ? 'auth.signUp' : 'auth.signIn')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')} testID="auth-switch-mode">
          <Text style={styles.switchModeText}>{t(mode === 'signUp' ? 'auth.switchToSignIn' : 'auth.switchToSignUp')}</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Ionicons name="home-outline" size={36} color={colors.ink} />
        <Text style={styles.appName}>{t('onboarding.appName')}</Text>
      </View>
      <Text style={styles.tagline}>{t('onboarding.tagline')}</Text>
      <View style={{ width: '100%', gap: spacing.md, marginTop: spacing.lg }}>
        <AnimatedPressable onPress={() => router.push('/onboarding/create-house')} testID="welcome-create-house" style={styles.primaryButton}>
          <Ionicons name="add-circle-outline" size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('onboarding.createHouse')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => router.push('/onboarding/join-house')} testID="welcome-join-house" style={styles.secondaryButton}>
          <Ionicons name="people-outline" size={18} color={colors.ink} />
          <Text style={styles.secondaryButtonText}>{t('onboarding.joinHouse')}</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  tagline: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  input: {
    width: '100%',
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
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    width: '100%',
  },
  primaryButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontWeight: '700',
  },
  switchModeText: {
    color: colors.textMuted,
  },
});
