import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  suggestMission,
  getHouseMembers,
  getMyMembership,
  type MissionCategory,
  type AssignmentMode,
} from '../../features/missions/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Avatar } from '../../components/Avatar';
import { CategoryIcon } from '../../components/CategoryIcon';
import { DateField } from '../../components/DatePicker';
import { Screen } from '../../components/Screen';
import { colors, spacing, radii, type, sectionColors, ICONS, MISSION_CATEGORIES, CATEGORY_META, tint } from '../../theme';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!houseId) {
      return;
    }
    getHouseMembers(houseId)
      .then(setMembers)
      .catch(() => {
        // no-op: if the member list fails to load, direct-assign just stays unavailable
      });
    // Only decides whether the inbox tab is shown; the membership is cached for
    // the session, so this costs nothing after the first screen.
    getMyMembership(houseId)
      .then((membership) => setIsAdmin(membership?.role === 'admin'))
      .catch(() => {});
  }, [houseId]);

  const canSubmit = !submitting && !!title && !!points && !!dueDate && (assignmentMode !== 'direct' || !!selectedMemberId);

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
    <Screen
      section="today"
      title={t('missions.suggestTitle')}
      icon={ICONS.add}
      tab="today"
      houseId={houseId}
      isAdmin={isAdmin}
      scroll
    >
      <Text style={styles.label}>{t('missions.categoryLabel')}</Text>
      <View style={styles.chipRow}>
        {MISSION_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const active = category === cat;
          return (
            <AnimatedPressable
              key={cat}
              onPress={() => setCategory(cat)}
              testID={`category-${cat}`}
              accessibilityState={{ selected: active }}
              // The category's own colour marks the selection instead of a flat
              // ink fill, so the palette that identifies chores everywhere else
              // in the app is the same thing you pick from here.
              style={[
                styles.categoryChip,
                { borderColor: active ? meta.color : colors.border },
                active && { backgroundColor: tint(meta.color, '1F') },
              ]}
            >
              <CategoryIcon category={cat} size={18} />
              <Text style={[styles.categoryChipText, active && { color: meta.color, fontWeight: '800' }]}>
                {t(`missions.categories.${cat}`)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('missions.titleLabel')}</Text>
      <TextInput value={title} onChangeText={setTitle} testID="mission-title-input" style={styles.input} />

      <Text style={styles.label}>{t('missions.pointsLabel')}</Text>
      <TextInput
        value={points}
        onChangeText={setPoints}
        keyboardType="numeric"
        testID="mission-points-input"
        style={styles.input}
      />

      <Text style={styles.label}>{t('missions.dueDateLabel')}</Text>
      <DateField value={dueDate} onChange={setDueDate} label={t('missions.dueDateLabel')} testID="mission-due-date-input" />

      <View style={styles.segment}>
        <AnimatedPressable
          onPress={() => setAssignmentMode('auto')}
          testID="assignment-pool"
          style={[styles.segmentOption, assignmentMode === 'auto' && styles.segmentOptionActive]}
        >
          <Text style={[styles.segmentText, assignmentMode === 'auto' && styles.segmentTextActive]}>
            {t('missions.assignmentPool')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setAssignmentMode('direct')}
          testID="assignment-direct"
          style={[styles.segmentOption, assignmentMode === 'direct' && styles.segmentOptionActive]}
        >
          <Text style={[styles.segmentText, assignmentMode === 'direct' && styles.segmentTextActive]}>
            {t('missions.assignmentDirect')}
          </Text>
        </AnimatedPressable>
      </View>

      {assignmentMode === 'direct' && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t('missions.selectMember')}</Text>
          <View style={styles.chipRow}>
            {members.map((m) => {
              const active = selectedMemberId === m.id;
              return (
                <AnimatedPressable
                  key={m.id}
                  onPress={() => setSelectedMemberId(m.id)}
                  testID={`member-${m.id}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.memberChip, active && styles.memberChipActive]}
                >
                  <Avatar memberId={m.id} name={m.name} size={22} />
                  <Text style={[styles.memberChipText, active && styles.memberChipTextActive]}>{m.name}</Text>
                </AnimatedPressable>
              );
            })}
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
        disabled={!canSubmit}
        testID="suggest-mission-submit"
        style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
      >
        <Ionicons name={ICONS.add} size={20} color={colors.ink} />
        <Text style={styles.submitButtonText}>{t('missions.submit')}</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.label,
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
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  categoryChipText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
    ...type.body,
    color: colors.ink,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    padding: 3,
  },
  segmentOption: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  segmentOptionActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    ...type.label,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.ink,
    fontWeight: '800',
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  memberChipActive: {
    borderColor: colors.ink,
    backgroundColor: tint(colors.ink, '12'),
  },
  memberChipText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  memberChipTextActive: {
    fontWeight: '800',
  },
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: sectionColors.today,
    borderRadius: radii.lg,
    minHeight: 52,
    marginTop: spacing.sm,
  },
  submitButtonText: {
    ...type.bodyStrong,
    fontWeight: '800',
    color: colors.ink,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
