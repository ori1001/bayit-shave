import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();

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
