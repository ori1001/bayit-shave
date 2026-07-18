import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { suggestMission, type MissionCategory, type AssignmentMode } from '../../features/missions/api';

const CATEGORIES: MissionCategory[] = ['dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other'];

export default function SuggestMissionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [category, setCategory] = useState<MissionCategory>('dishes');
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('10');
  const [dueDate, setDueDate] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('auto');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await suggestMission({
        house_id: houseId,
        category,
        title,
        points: Number(points),
        due_date: dueDate,
        assignment_mode: assignmentMode,
      });
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{t('missions.suggestTitle')}</Text>

      <Text>{t('missions.categoryLabel')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategory(cat)}
            testID={`category-${cat}`}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: category === cat ? '#26332E' : '#ccc',
              backgroundColor: category === cat ? '#26332E' : 'transparent',
            }}
          >
            <Text style={{ color: category === cat ? '#F6F1E4' : '#26332E' }}>{t(`missions.categories.${cat}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text>{t('missions.titleLabel')}</Text>
      <TextInput value={title} onChangeText={setTitle} testID="mission-title-input" style={{ borderWidth: 1, borderRadius: 12, padding: 12 }} />

      <Text>{t('missions.pointsLabel')}</Text>
      <TextInput
        value={points}
        onChangeText={setPoints}
        keyboardType="numeric"
        testID="mission-points-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <Text>{t('missions.dueDateLabel')}</Text>
      <TextInput
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="2026-07-20"
        testID="mission-due-date-input"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setAssignmentMode('auto')}
          testID="assignment-pool"
          style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: assignmentMode === 'auto' ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: assignmentMode === 'auto' ? '#F6F1E4' : '#26332E' }}>{t('missions.assignmentPool')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setAssignmentMode('direct')}
          testID="assignment-direct"
          style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: assignmentMode === 'direct' ? '#26332E' : 'transparent', borderWidth: 1.5, borderColor: '#26332E' }}
        >
          <Text style={{ color: assignmentMode === 'direct' ? '#F6F1E4' : '#26332E' }}>{t('missions.assignmentDirect')}</Text>
        </Pressable>
      </View>

      {error && <Text testID="suggest-mission-error">{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting || !title || !points || !dueDate}
        testID="suggest-mission-submit"
        style={{ backgroundColor: '#E0A845', borderRadius: 14, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ fontWeight: '800' }}>{t('missions.submit')}</Text>
      </Pressable>
    </ScrollView>
  );
}
