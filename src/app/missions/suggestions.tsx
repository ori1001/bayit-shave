import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { getSuggestions, resolveSuggestion, getHouseMembers, type Mission } from '../../features/missions/api';
import {
  getPendingSwapsForAdmin,
  getPendingUnavailability,
  resolveSwap,
  resolveUnavailability,
  type SwapRequest,
  type UnavailabilityRequest,
} from '../../features/requests/api';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' {
  return mission.status === 'pending_approval' ? 'new_mission' : 'points_edit';
}

type InboxItem =
  | { kind: 'mission'; mission: Mission }
  | { kind: 'swap'; swap: SwapRequest }
  | { kind: 'unavailability'; unavailability: UnavailabilityRequest };

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [missions, swaps, unavailability, houseMembers] = await Promise.all([
      getSuggestions(houseId),
      getPendingSwapsForAdmin(houseId),
      getPendingUnavailability(houseId),
      getHouseMembers(houseId),
    ]);
    setMembers(houseMembers);
    setItems([
      ...missions.map((mission): InboxItem => ({ kind: 'mission', mission })),
      ...swaps.map((swap): InboxItem => ({ kind: 'swap', swap })),
      ...unavailability.map((unavailability): InboxItem => ({ kind: 'unavailability', unavailability })),
    ]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleMissionDecision(mission: Mission, decision: 'approve' | 'reject') {
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await load();
  }

  async function handleSwapDecision(swap: SwapRequest, decision: 'approve' | 'reject') {
    await resolveSwap(swap.id, decision);
    await load();
  }

  async function handleUnavailabilityDecision(unavailability: UnavailabilityRequest, decision: 'approve' | 'reject') {
    await resolveUnavailability(unavailability.id, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('suggestions.title')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          item.kind === 'mission' ? item.mission.id : item.kind === 'swap' ? item.swap.id : item.unavailability.id
        }
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>{t('suggestions.empty')}</Text>}
        renderItem={({ item }) => {
          if (item.kind === 'mission') {
            const kind = suggestionTypeOf(item.mission);
            return (
              <View testID={`suggestion-${item.mission.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>
                  {kind === 'new_mission' ? t('suggestions.newMission') : t('suggestions.pointsEdit')}
                </Text>
                <Text style={{ fontWeight: '700' }}>
                  {kind === 'new_mission'
                    ? `${item.mission.title} · ${item.mission.points}`
                    : `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => handleMissionDecision(item.mission, 'approve')}
                    testID={`approve-${item.mission.id}`}
                    style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleMissionDecision(item.mission, 'reject')}
                    testID={`reject-${item.mission.id}`}
                    style={{ flex: 1, borderWidth: 1.5, borderColor: '#A6425A', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('suggestions.reject')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          if (item.kind === 'swap') {
            return (
              <View testID={`suggestion-swap-${item.swap.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>{t('suggestions.swap')}</Text>
                <Text style={{ fontWeight: '700' }}>
                  {item.swap.mission_instances?.title ?? ''} ·{' '}
                  {members.find((m) => m.id === item.swap.from_member)?.name ?? item.swap.from_member} →{' '}
                  {members.find((m) => m.id === item.swap.to_member)?.name ?? item.swap.to_member}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => handleSwapDecision(item.swap, 'approve')}
                    testID={`approve-swap-${item.swap.id}`}
                    style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleSwapDecision(item.swap, 'reject')}
                    testID={`reject-swap-${item.swap.id}`}
                    style={{ flex: 1, borderWidth: 1.5, borderColor: '#A6425A', borderRadius: 10, padding: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('suggestions.reject')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          return (
            <View testID={`suggestion-unavailability-${item.unavailability.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>{t('suggestions.unavailability')}</Text>
              <Text style={{ fontWeight: '700' }}>
                {item.unavailability.period_start} → {item.unavailability.period_end}
                {item.unavailability.reason ? ` · ${item.unavailability.reason}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'approve')}
                  testID={`approve-unavailability-${item.unavailability.id}`}
                  style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'reject')}
                  testID={`reject-unavailability-${item.unavailability.id}`}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#A6425A', borderRadius: 10, padding: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#A6425A', fontWeight: '700' }}>{t('suggestions.reject')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
