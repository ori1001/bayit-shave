import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { suggestMission, getHouseMembers, type MissionCategory, type AssignmentMode } from '../../features/missions/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { CategoryIcon } from '../../components/CategoryIcon';
import { colors, spacing, radii, MISSION_CATEGORIES } from '../../theme';

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
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (houseId) {
      getHouseMembers(houseId)
        .then(setMembers)
        .catch(() => {
          // no-op: if the member list fails to load, direct-assign just stays unavailable
        });
    }
  }, [houseId]);

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
        ...(assignmentMode === 'direct' ? { target_member_id: selectedMemberId! } : {}),
      });
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{t('missions.suggestTitle')}</Text>

      <Text style={styles.label}>{t('missions.categoryLabel')}</Text>
      <View style={styles.chipRow}>
        {MISSION_CATEGORIES.map((cat) => (
          <AnimatedPressable
            key={cat}
            onPress={() => setCategory(cat)}
            testID={`category-${cat}`}
            style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
          >
            <CategoryIcon category={cat} size={16} />
            <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>{t(`missions.categories.${cat}`)}</Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={styles.label}>{t('missions.titleLabel')}</Text>
      <TextInput value={title} onChangeText={setTitle} testID="mission-title-input" style={styles.input} />

      <Text style={styles.label}>{t('missions.pointsLabel')}</Text>
      <TextInput value={points} onChangeText={setPoints} keyboardType="numeric" testID="mission-points-input" style={styles.input} />

      <Text style={styles.label}>{t('missions.dueDateLabel')}</Text>
      <TextInput value={dueDate} onChangeText={setDueDate} placeholder="2026-07-20" testID="mission-due-date-input" style={styles.input} />

      <View style={styles.toggleRow}>
        <AnimatedPressable
          onPress={() => setAssignmentMode('auto')}
          testID="assignment-pool"
          style={[styles.toggleOption, assignmentMode === 'auto' && styles.toggleOptionActive]}
        >
          <Text style={[styles.toggleOptionText, assignmentMode === 'auto' && styles.toggleOptionTextActive]}>{t('missions.assignmentPool')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setAssignmentMode('direct')}
          testID="assignment-direct"
          style={[styles.toggleOption, assignmentMode === 'direct' && styles.toggleOptionActive]}
        >
          <Text style={[styles.toggleOptionText, assignmentMode === 'direct' && styles.toggleOptionTextActive]}>{t('missions.assignmentDirect')}</Text>
        </AnimatedPressable>
      </View>

      {assignmentMode === 'direct' && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t('missions.selectMember')}</Text>
          <View style={styles.chipRow}>
            {members.map((m) => (
              <AnimatedPressable
                key={m.id}
                onPress={() => setSelectedMemberId(m.id)}
                testID={`member-${m.id}`}
                style={[styles.memberChip, selectedMemberId === m.id && styles.memberChipActive]}
              >
                <Text style={[styles.memberChipText, selectedMemberId === m.id && styles.memberChipTextActive]}>{m.name}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {error && (
        <Text testID="suggest-mission-error" style={styles.errorText}>
          {error}
        </Text>
      )}

      <AnimatedPressable
        onPress={handleSubmit}
        disabled={submitting || !title || !points || !dueDate || (assignmentMode === 'direct' && !selectedMemberId)}
        testID="suggest-mission-submit"
        style={styles.submitButton}
      >
        <Ionicons name="add-circle-outline" size={18} color={colors.ink} />
        <Text style={styles.submitButtonText}>{t('missions.submit')}</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  categoryChipText: {
    color: colors.ink,
  },
  categoryChipTextActive: {
    color: colors.cream,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleOption: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: 'transparent',
  },
  toggleOptionActive: {
    backgroundColor: colors.ink,
  },
  toggleOptionText: {
    color: colors.ink,
  },
  toggleOptionTextActive: {
    color: colors.cream,
  },
  memberChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  memberChipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  memberChipText: {
    color: colors.ink,
  },
  memberChipTextActive: {
    color: colors.cream,
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  submitButtonText: {
    color: colors.ink,
    fontWeight: '800',
  },
});
