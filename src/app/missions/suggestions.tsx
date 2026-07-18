import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { getSuggestions, resolveSuggestion, type Mission } from '../../features/missions/api';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' {
  return mission.status === 'pending_approval' ? 'new_mission' : 'points_edit';
}

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [suggestions, setSuggestions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const rows = await getSuggestions(houseId);
    setSuggestions(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleDecision(mission: Mission, decision: 'approve' | 'reject') {
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('suggestions.title')}</Text>
      <FlatList
        data={suggestions}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Text style={{ opacity: 0.6 }}>{t('suggestions.empty')}</Text>}
        renderItem={({ item }) => {
          const kind = suggestionTypeOf(item);
          return (
            <View testID={`suggestion-${item.id}`} style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', opacity: 0.6 }}>
                {kind === 'new_mission' ? t('suggestions.newMission') : t('suggestions.pointsEdit')}
              </Text>
              <Text style={{ fontWeight: '700' }}>
                {kind === 'new_mission' ? `${item.title} · ${item.points}` : `${item.title} · ${item.points} → ${item.proposed_points}`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => handleDecision(item, 'approve')}
                  testID={`approve-${item.id}`}
                  style={{ flex: 1, backgroundColor: '#7C9473', borderRadius: 10, padding: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('suggestions.approve')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDecision(item, 'reject')}
                  testID={`reject-${item.id}`}
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
