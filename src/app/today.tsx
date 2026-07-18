import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { getMyHouseId, getMyMembership, getTodayMissions, completeMission, type Mission } from '../features/missions/api';

export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const hId = await getMyHouseId();
    if (!hId) {
      router.replace('/');
      return;
    }
    setHouseId(hId);
    const membership = await getMyMembership(hId);
    setIsAdmin(membership?.role === 'admin');
    if (membership) {
      const todayMissions = await getTodayMissions(hId, membership.id);
      setMissions(todayMissions);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleComplete(missionId: string) {
    await completeMission(missionId);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: '800' }}>{t('today.greeting')}</Text>
      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>{t('today.noMissions')}</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleComplete(item.id)}
            testID={`mission-row-${item.id}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2 }} />
            <Text style={{ flex: 1, fontWeight: '700' }}>{item.title}</Text>
            <Text>{item.points}</Text>
          </Pressable>
        )}
      />
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={() => router.push({ pathname: '/missions/suggest', params: { houseId: houseId ?? '' } })}
          testID="today-suggest-mission"
          style={{ backgroundColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#F6F1E4', fontWeight: '700' }}>{t('today.suggestMission')}</Text>
        </Pressable>
        {isAdmin && (
          <Pressable
            onPress={() => router.push({ pathname: '/missions/suggestions', params: { houseId: houseId ?? '' } })}
            testID="today-suggestions-inbox"
            style={{ borderWidth: 1.5, borderColor: '#26332E', borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#26332E', fontWeight: '700' }}>{t('today.suggestions')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
