import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMonthMissions, getHouseMembers, getMyMembership, editMissionSchedule, type Mission } from '../features/missions/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { CategoryIcon } from '../components/CategoryIcon';
import { colors, spacing, radii, CATEGORY_META } from '../theme';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const membership = await getMyMembership(houseId);
    setMyMemberId(membership?.id ?? null);
    setIsAdmin(membership?.role === 'admin');
    const [monthMissions, houseMembers] = await Promise.all([getMonthMissions(houseId, year, month), getHouseMembers(houseId)]);
    setMissions(monthMissions);
    setMembers(houseMembers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId, year, month]);

  const visibleMissions = useMemo(() => (mineOnly ? missions.filter((m) => m.assigned_to === myMemberId) : missions), [missions, mineOnly, myMemberId]);

  const missionsByDay = useMemo(() => {
    const map = new Map<number, Mission[]>();
    for (const mission of visibleMissions) {
      const day = Number(mission.due_date.slice(8, 10));
      const existing = map.get(day) ?? [];
      existing.push(mission);
      map.set(day, existing);
    }
    return map;
  }, [visibleMissions]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function handlePrevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  }

  function startEditDate(mission: Mission) {
    setScheduleError(null);
    setEditingMissionId(mission.id);
    setNewDateValue(mission.due_date);
  }

  async function handleSaveDate(missionId: string) {
    setScheduleError(null);
    try {
      await editMissionSchedule(missionId, newDateValue);
      setEditingMissionId(null);
      await load();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : t('calendar.saveError'));
    }
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  const selectedMissions = selectedDay !== null ? (missionsByDay.get(selectedDay) ?? []) : [];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('calendar.title')}</Text>

      <View style={styles.monthNav}>
        <AnimatedPressable onPress={handlePrevMonth} testID="calendar-prev-month" style={styles.monthNavButton}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </AnimatedPressable>
        <Text style={styles.monthLabel}>
          {year}-{String(month).padStart(2, '0')}
        </Text>
        <AnimatedPressable onPress={handleNextMonth} testID="calendar-next-month" style={styles.monthNavButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </AnimatedPressable>
      </View>

      <View style={styles.toggleRow}>
        <AnimatedPressable onPress={() => setMineOnly(false)} testID="calendar-everyone" style={[styles.toggleOption, !mineOnly && styles.toggleOptionActive]}>
          <Text style={[styles.toggleOptionText, !mineOnly && styles.toggleOptionTextActive]}>{t('calendar.everyone')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setMineOnly(true)} testID="calendar-mine" style={[styles.toggleOption, mineOnly && styles.toggleOptionActive]}>
          <Text style={[styles.toggleOptionText, mineOnly && styles.toggleOptionTextActive]}>{t('calendar.mine')}</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.grid}>
        {dayNumbers.map((day) => {
          const dayMissions = missionsByDay.get(day) ?? [];
          return (
            <AnimatedPressable key={day} onPress={() => setSelectedDay(day)} testID={`calendar-day-${day}`} style={[styles.dayCell, selectedDay === day && styles.dayCellSelected]}>
              <Text style={styles.dayNumber}>{day}</Text>
              <View style={styles.dotRow}>
                {dayMissions.slice(0, 3).map((m, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: (CATEGORY_META[m.category] ?? CATEGORY_META.other).color }]} />
                ))}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      {selectedDay !== null && (
        <ScrollView style={styles.dayDetail} contentContainerStyle={{ gap: spacing.sm }}>
          {selectedMissions.length === 0 && <Text style={styles.emptyText}>{t('calendar.noMissionsThisDay')}</Text>}
          {selectedMissions.map((mission) => {
            const canEdit = isAdmin || mission.assigned_to === myMemberId;
            const assigneeName = members.find((m) => m.id === mission.assigned_to)?.name ?? '';
            return (
              <Card key={mission.id} testID={`calendar-mission-${mission.id}`} style={styles.missionCard}>
                <View style={styles.missionCardHeader}>
                  <CategoryIcon category={mission.category} size={18} />
                  <Text style={styles.missionCardTitle}>{mission.title}</Text>
                  <Text style={styles.missionCardPoints}>{mission.points}</Text>
                </View>
                <Text style={styles.assigneeText}>{assigneeName}</Text>
                {canEdit ? (
                  <AnimatedPressable onPress={() => startEditDate(mission)} testID={`calendar-edit-${mission.id}`}>
                    <Text style={styles.editLink}>{isAdmin ? t('calendar.editDate') : t('calendar.suggestNewDate')}</Text>
                  </AnimatedPressable>
                ) : (
                  <Text style={styles.viewOnlyText}>{t('calendar.viewOnly')}</Text>
                )}
                {editingMissionId === mission.id && (
                  <View style={{ gap: spacing.xs }}>
                    <Text style={styles.dateInputLabel}>{t('calendar.newDateLabel')}</Text>
                    <View style={styles.editRow}>
                      <TextInput value={newDateValue} onChangeText={setNewDateValue} testID={`calendar-date-input-${mission.id}`} style={styles.dateInput} />
                      <AnimatedPressable onPress={() => handleSaveDate(mission.id)} testID={`calendar-date-save-${mission.id}`}>
                        <Text style={styles.saveText}>{t('calendar.save')}</Text>
                      </AnimatedPressable>
                      <AnimatedPressable onPress={() => setEditingMissionId(null)} testID={`calendar-date-cancel-${mission.id}`}>
                        <Text style={styles.cancelText}>{t('calendar.cancel')}</Text>
                      </AnimatedPressable>
                    </View>
                    {scheduleError && (
                      <Text testID={`calendar-schedule-error-${mission.id}`} style={styles.errorText}>
                        {scheduleError}
                      </Text>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthNavButton: {
    padding: spacing.xs,
  },
  monthLabel: {
    fontWeight: '700',
    color: colors.ink,
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
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.ink,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dayCell: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  dayNumber: {
    fontSize: 11,
    color: colors.ink,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dayDetail: {
    flex: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
  },
  missionCard: {
    gap: spacing.xs,
  },
  missionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  missionCardTitle: {
    fontWeight: '700',
    flex: 1,
    color: colors.ink,
  },
  missionCardPoints: {
    fontSize: 12,
    color: colors.textMuted,
  },
  assigneeText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  editLink: {
    fontSize: 12,
    color: colors.teal,
  },
  viewOnlyText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  dateInputLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.xs,
    width: 120,
    backgroundColor: colors.surface,
  },
  saveText: {
    color: colors.sage,
    fontWeight: '700',
  },
  cancelText: {
    color: colors.rose,
    fontWeight: '700',
  },
  errorText: {
    color: colors.rose,
    fontSize: 12,
  },
});
