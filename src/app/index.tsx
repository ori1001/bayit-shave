import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { signUp, signIn, signInWithGoogle, resendConfirmation, openMailApp } from '../features/auth/api';
import { getMyHouseId } from '../features/missions/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CategoryIcon } from '../components/CategoryIcon';
import { Logo, LogoMark } from '../components/Logo';
import { colors, spacing, radii, MISSION_CATEGORIES } from '../theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'signUp' | 'signIn'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resent, setResent] = useState(false);

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
        const { needsEmailConfirmation } = await signUp(email, password);
        // Sign-up succeeds without a session when the project requires email
        // confirmation. Saying so is the whole point -- otherwise the screen
        // just sits there and looks broken.
        if (needsEmailConfirmation) {
          setAwaitingConfirmation(true);
        }
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await resendConfirmation(email);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      // false means the user closed the browser -- a cancellation, not a
      // failure, so nothing is shown.
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  if (hasSession === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (awaitingConfirmation) {
    return (
      <View style={styles.screen} testID="auth-awaiting-confirmation">
        <LogoMark size={64} />
        <Text style={styles.appName}>{t('auth.checkEmail')}</Text>
        <Text style={styles.tagline}>{t('auth.checkEmailBody', { email })}</Text>
        <AnimatedPressable onPress={openMailApp} testID="auth-open-mail" style={styles.primaryButton}>
          <Ionicons name="mail-open-outline" size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('auth.openMailApp')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => {
            // The link establishes the session on the server; a sign-in here
            // picks it up without making the user retype anything.
            setAwaitingConfirmation(false);
            setMode('signIn');
          }}
          testID="auth-back-to-signin"
          style={styles.googleButton}
        >
          <Ionicons name="log-in-outline" size={18} color={colors.ink} />
          <Text style={styles.googleButtonText}>{t('auth.iConfirmed')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={handleResend} testID="auth-resend">
          <Text style={styles.switchModeText}>{resent ? t('auth.resent') : t('auth.resend')}</Text>
        </AnimatedPressable>
        {error && (
          <Text testID="auth-error" style={styles.errorText}>
            {error}
          </Text>
        )}
      </View>
    );
  }

  if (!hasSession) {
    return (
      <View style={styles.screen}>
        <Logo size={84} />
        <Text style={styles.tagline}>{t('onboarding.tagline')}</Text>
        {/* The category palette is the app's whole visual identity and used to
            appear only after sign-in, leaving the first screen colourless. */}
        <View style={styles.categoryStrip}>
          {MISSION_CATEGORIES.filter((c) => c !== 'other').map((category) => (
            <CategoryIcon key={category} category={category} size={26} />
          ))}
        </View>
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
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.orDivider')}</Text>
          <View style={styles.dividerLine} />
        </View>
        <AnimatedPressable
          onPress={handleGoogleSignIn}
          disabled={submitting}
          testID="auth-google"
          style={styles.googleButton}
        >
          <Ionicons name="logo-google" size={18} color={colors.ink} />
          <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')} testID="auth-switch-mode">
          <Text style={styles.switchModeText}>{t(mode === 'signUp' ? 'auth.switchToSignIn' : 'auth.switchToSignUp')}</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Logo size={84} />
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
  brandBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  categoryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  googleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    width: '100%',
    backgroundColor: colors.surface,
  },
  googleButtonText: {
    color: colors.ink,
    fontWeight: '700',
  },
});
