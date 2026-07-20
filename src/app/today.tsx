import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { getMyHouseId, getMyMembership, getTodayMissions, getHouseMembers, completeMission, editMissionPoints, type Mission } from '../features/missions/api';
import { getMyIncomingSwaps, suggestSwap, respondSwap, type SwapRequest } from '../features/requests/api';

export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editPointsValue, setEditPointsValue] = useState('');
  const [pointsEditFeedback, setPointsEditFeedback] = useState<string | null>(null);
  const [pointsEditError, setPointsEditError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [incomingSwaps, setIncomingSwaps] = useState<SwapRequest[]>([]);
  const [swappingMissionId, setSwappingMissionId] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

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
      setMyMemberId(membership.id);
      const [todayMissions, houseMembers, swaps] = await Promise.all([
        getTodayMissions(hId, membership.id),
        getHouseMembers(hId),
        getMyIncomingSwaps(hId, membership.id),
      ]);
      setMissions(todayMissions);
      setMembers(houseMembers);
      setIncomingSwaps(swaps);
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
    setPointsEditError(null);
    try {
      await editMissionPoints(missionId, Number(editPointsValue));
      setEditingMissionId(null);
      if (!isAdmin) {
        setPointsEditFeedback(t('missions.pointsProposalSent'));
        setTimeout(() => setPointsEditFeedback(null), 4000);
      }
      await load();
    } catch (e) {
      setPointsEditError(e instanceof Error ? e.message : t('missions.editPointsError'));
    }
  }

  async function handleRequestSwap(missionId: string, toMemberId: string) {
    await suggestSwap(missionId, toMemberId);
    setSwappingMissionId(null);
    await load();
  }

  async function handleRespondSwap(swapId: string, decision: 'accept' | 'decline') {
    await respondSwap(swapId, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: '800' }}>{t('today.greeting')}</Text>
      {incomingSwaps.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>{t('swap.incomingTitle')}</Text>
          {incomingSwaps.map((swap) => (
            <View key={swap.id} testID={`incoming-swap-${swap.id}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ flex: 1 }}>{members.find((m) => m.id === swap.from_member)?.name ?? swap.from_member}</Text>
              <Pressable onPress={() => handleRespondSwap(swap.id, 'accept')} testID={`accept-swap-${swap.id}`} style={{ padding: 8 }}>
                <Text style={{ color: '#7C9473', fontWeight: '700' }}>{t('swap.accept')}</Text>
              </Pressable>
              <Pressable onPress={() => handleRespondSwap(swap.id, 'decline')} testID={`decline-swap-${swap.id}`} style={{ padding: 8 }}>
                <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('swap.decline')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {pointsEditFeedback && <Text testID="points-edit-feedback">{pointsEditFeedback}</Text>}
      {pointsEditError && <Text testID="points-edit-error">{pointsEditError}</Text>}
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
              <Pressable onPress={() => setSwappingMissionId(item.id)} testID={`swap-${item.id}`} style={{ padding: 4 }}>
                <Text style={{ fontSize: 12, opacity: 0.6 }}>{t('swap.requestSwap')}</Text>
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
            {swappingMissionId === item.id && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingStart: 32 }}>
                <Text style={{ width: '100%', fontSize: 12, opacity: 0.6 }}>{t('swap.selectMember')}</Text>
                {members
                  .filter((m) => m.id !== myMemberId)
                  .map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => handleRequestSwap(item.id, m.id)}
                      testID={`swap-target-${item.id}-${m.id}`}
                      style={{ borderWidth: 1, borderRadius: 8, padding: 6 }}
                    >
                      <Text style={{ fontSize: 11 }}>{m.name}</Text>
                    </Pressable>
                  ))}
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
        <Pressable
          onPress={() => router.push({ pathname: '/balance', params: { houseId: houseId ?? '' } })}
          testID="today-balance"
          style={{ borderWidth: 1.5, borderColor: '#4C7A8C', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#4C7A8C', fontWeight: '700' }}>{t('today.balance')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/unavailability/suggest', params: { houseId: houseId ?? '' } })}
          testID="today-unavailability"
          style={{ borderWidth: 1.5, borderColor: '#8B5FBF', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#8B5FBF', fontWeight: '700' }}>{t('today.unavailability')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/calendar', params: { houseId: houseId ?? '' } })}
          testID="today-calendar"
          style={{ borderWidth: 1.5, borderColor: '#5B72C9', borderRadius: 14, padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#5B72C9', fontWeight: '700' }}>{t('today.calendar')}</Text>
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
