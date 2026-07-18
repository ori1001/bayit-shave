import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { signUp, signIn } from '../features/auth/api';
import { getMyHouseId } from '../features/missions/api';

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
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
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
    return <View style={{ flex: 1 }} />;
  }

  if (!hasSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '800' }}>{t('onboarding.appName')}</Text>
        <Text style={{ textAlign: 'center', opacity: 0.7 }}>{t('onboarding.tagline')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailLabel')}
          testID="auth-email-input"
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ width: '100%', borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordLabel')}
          testID="auth-password-input"
          secureTextEntry
          style={{ width: '100%', borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        {error && <Text testID="auth-error">{error}</Text>}
        <Pressable
          onPress={handleAuthSubmit}
          disabled={submitting || !email || !password}
          testID="auth-submit"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center', width: '100%' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>
            {t(mode === 'signUp' ? 'auth.signUp' : 'auth.signIn')}
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')} testID="auth-switch-mode">
          <Text style={{ opacity: 0.6 }}>{t(mode === 'signUp' ? 'auth.switchToSignIn' : 'auth.switchToSignUp')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '800' }}>{t('onboarding.appName')}</Text>
      <Text style={{ textAlign: 'center', opacity: 0.7 }}>{t('onboarding.tagline')}</Text>
      <View style={{ width: '100%', gap: 12, marginTop: 16 }}>
        <Pressable
          onPress={() => router.push('/onboarding/create-house')}
          testID="welcome-create-house"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>{t('onboarding.createHouse')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/onboarding/join-house')}
          testID="welcome-join-house"
          style={{ borderWidth: 1.5, borderColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#26332E', fontWeight: '700' }}>{t('onboarding.joinHouse')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
