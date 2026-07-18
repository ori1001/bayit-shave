import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { getMyHouseId, getMyMembership, getTodayMissions, completeMission, editMissionPoints, type Mission } from '../features/missions/api';

export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editPointsValue, setEditPointsValue] = useState('');

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

  function startEditPoints(mission: Mission) {
    setEditingMissionId(mission.id);
    setEditPointsValue(String(mission.points));
  }

  async function handleSaveEditPoints(missionId: string) {
    await editMissionPoints(missionId, Number(editPointsValue));
    setEditingMissionId(null);
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
          <View style={{ gap: 6 }}>
            <Pressable
              onPress={() => handleComplete(item.id)}
              testID={`mission-row-${item.id}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2 }} />
              <Text style={{ flex: 1, fontWeight: '700' }}>{item.title}</Text>
              <Text>{item.points}</Text>
              <Pressable onPress={() => startEditPoints(item)} testID={`edit-points-${item.id}`} style={{ padding: 4 }}>
                <Text style={{ fontSize: 12, opacity: 0.6 }}>{t('missions.editPoints')}</Text>
              </Pressable>
            </Pressable>
            {editingMissionId === item.id && (
              <View style={{ flexDirection: 'row', gap: 8, paddingStart: 32 }}>
                <TextInput
                  value={editPointsValue}
                  onChangeText={setEditPointsValue}
                  keyboardType="numeric"
                  testID={`edit-points-input-${item.id}`}
                  style={{ borderWidth: 1, borderRadius: 8, padding: 8, width: 80 }}
                />
                <Pressable onPress={() => handleSaveEditPoints(item.id)} testID={`edit-points-save-${item.id}`} style={{ padding: 8 }}>
                  <Text>{t('missions.save')}</Text>
                </Pressable>
                <Pressable onPress={() => setEditingMissionId(null)} testID={`edit-points-cancel-${item.id}`} style={{ padding: 8 }}>
                  <Text>{t('missions.cancel')}</Text>
                </Pressable>
              </View>
            )}
          </View>
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
