import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { editMissionSchedule, type Mission } from '../features/missions/api';
import { fetchCalendar, calendarKey } from '../features/tabs-data';
import { useScreenData } from '../lib/screen-data';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { CategoryIcon } from '../components/CategoryIcon';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { MonthGrid, localeOf } from '../components/MonthGrid';
import { FadeIn } from '../components/Motion';
import { syncMissionsToDeviceCalendar } from '../features/calendar-sync/api';
import { DateField } from '../components/DatePicker';
import { addMonths } from '../lib/dates';
import { colors, spacing, radii, type, CATEGORY_META, sectionColors, ICONS } from '../theme';

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchMonth = useCallback(() => fetchCalendar(houseId, year, month), [houseId, year, month]);

  // Keyed by month, so paging back to a month already opened is instant too.
  const { data, fromCache, loading, error, refresh } = useScreenData(calendarKey(houseId, year, month), fetchMonth);

  const missions = useMemo(() => data?.missions ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);
  const myMemberId = data?.myMemberId ?? null;
  const isAdmin = data?.isAdmin;

  const visibleMissions = useMemo(
    () => (mineOnly ? missions.filter((m) => m.assigned_to === myMemberId) : missions),
    [missions, mineOnly, myMemberId]
  );

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

  function handleMonth(delta: number) {
    const next = addMonths(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
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
      await refresh();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : t('calendar.saveError'));
    }
  }

  async function handleSyncToDevice() {
    setSyncMessage(null);
    try {
      const result = await syncMissionsToDeviceCalendar(visibleMissions);
      // null means device calendars are unavailable here (web, or declined),
      // which is a state to explain rather than an error to throw.
      setSyncMessage(
        result === null ? t('calendar.syncUnavailable') : t('calendar.synced', { count: result.created + result.updated })
      );
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : t('calendar.saveError'));
    }
  }

  async function handleReassign(missionId: string, memberId: string) {
    setScheduleError(null);
    try {
      // Date left untouched -- an admin reassigns outright, a member's choice
      // lands as a proposal for the inbox.
      await editMissionSchedule(missionId, null, memberId);
      setEditingMissionId(null);
      await refresh();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : t('calendar.saveError'));
    }
  }

  const selectedMissions = selectedDay !== null ? (missionsByDay.get(selectedDay) ?? []) : [];
  const selectedLabel =
    selectedDay !== null
      ? new Date(year, month - 1, selectedDay).toLocaleDateString(localeOf(i18n.language), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : '';

  return (
    <Screen
      section="calendar"
      title={t('calendar.title')}
      icon={ICONS.calendar}
      tab="calendar"
      houseId={houseId}
      isAdmin={isAdmin}
      loading={loading}
      error={error}
      onRetry={refresh}
      errorTestID="calendar-load-error"
      headerRight={
        <AnimatedPressable
          onPress={handleSyncToDevice}
          testID="calendar-sync-device"
          style={styles.headerAction}
          accessibilityLabel={t('calendar.syncToDevice')}
        >
          <Ionicons name="calendar-outline" size={22} color={sectionColors.calendar} />
        </AnimatedPressable>
      }
    >
      {syncMessage && (
        <Text testID="calendar-sync-message" style={styles.syncMessage}>
          {syncMessage}
        </Text>
      )}

      {/* Segmented control rather than two outlined buttons: one continuous
          track with a sliding-looking selection reads as a filter, whereas two
          bordered pills read as two separate actions. */}
      <View style={styles.segment}>
        <AnimatedPressable
          onPress={() => setMineOnly(false)}
          testID="calendar-everyone"
          style={[styles.segmentOption, !mineOnly && styles.segmentOptionActive]}
        >
          <Text style={[styles.segmentText, !mineOnly && styles.segmentTextActive]}>{t('calendar.everyone')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setMineOnly(true)}
          testID="calendar-mine"
          style={[styles.segmentOption, mineOnly && styles.segmentOptionActive]}
        >
          <Text style={[styles.segmentText, mineOnly && styles.segmentTextActive]}>{t('calendar.mine')}</Text>
        </AnimatedPressable>
      </View>

      <Card style={styles.gridCard}>
        <MonthGrid
          year={year}
          month={month}
          onMonth={handleMonth}
          onPick={(date) => setSelectedDay(date.getDate())}
          selected={selectedDay !== null ? new Date(year, month - 1, selectedDay) : null}
          testID="calendar"
          renderDay={(_, day) => {
            const dayMissions = missionsByDay.get(day) ?? [];
            if (dayMissions.length === 0) {
              // A fixed-height spacer, so a day with chores and a day without
              // keep their numbers on the same baseline.
              return <View style={styles.dotRow} />;
            }
            return (
              <View style={styles.dotRow} testID={`calendar-day-${day}-dots`}>
                {dayMissions.slice(0, 3).map((m, i) => (
                  <View
                    key={i}
                    style={[styles.dot, { backgroundColor: (CATEGORY_META[m.category] ?? CATEGORY_META.other).color }]}
                  />
                ))}
                {dayMissions.length > 3 && <View style={[styles.dot, styles.dotOverflow]} testID={`calendar-day-${day}-overflow`} />}
              </View>
            );
          }}
        />
      </Card>

      {selectedDay === null ? (
        <EmptyState
          icon={ICONS.calendar}
          tone={sectionColors.calendar}
          title={t('calendar.pickDayTitle')}
          body={t('calendar.pickDayBody')}
          testID="calendar-pick-day"
        />
      ) : (
        <View style={styles.dayPanel}>
          <View style={styles.dayPanelHeader}>
            <Text style={styles.dayPanelTitle}>{selectedLabel}</Text>
            {selectedMissions.length > 0 && (
              <Text style={styles.dayPanelCount}>{t('calendar.missionsOnDay', { count: selectedMissions.length })}</Text>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.dayList} showsVerticalScrollIndicator={false}>
            {selectedMissions.length === 0 && (
              <EmptyState
                icon="cafe-outline"
                tone={sectionColors.calendar}
                title={t('calendar.emptyDayTitle')}
                body={t('calendar.emptyDayBody')}
                testID="calendar-empty-day"
              />
            )}
            {selectedMissions.map((mission, index) => {
              const canEdit = isAdmin || mission.assigned_to === myMemberId;
              const assigneeName = members.find((m) => m.id === mission.assigned_to)?.name ?? '';
              return (
                <FadeIn key={mission.id} index={index} skip={fromCache}>
                  <Card testID={`calendar-mission-${mission.id}`} style={styles.missionCard}>
                    <View style={styles.missionCardHeader}>
                      <CategoryIcon category={mission.category} size={20} />
                      <Text style={styles.missionCardTitle}>{mission.title}</Text>
                      <Text style={styles.missionCardPoints}>{mission.points}</Text>
                    </View>
                    {assigneeName ? <Text style={styles.assigneeText}>{assigneeName}</Text> : null}
                    {canEdit ? (
                      <AnimatedPressable onPress={() => startEditDate(mission)} testID={`calendar-edit-${mission.id}`} style={styles.editAction}>
                        <Ionicons name={ICONS.edit} size={16} color={sectionColors.calendar} />
                        <Text style={styles.editLink}>{isAdmin ? t('calendar.editDate') : t('calendar.suggestNewDate')}</Text>
                      </AnimatedPressable>
                    ) : (
                      <Text style={styles.viewOnlyText}>{t('calendar.viewOnly')}</Text>
                    )}
                    {editingMissionId === mission.id && (
                      <View style={{ gap: spacing.sm }}>
                        <Text style={styles.dateInputLabel}>{t('calendar.newDateLabel')}</Text>
                        <DateField
                          value={newDateValue}
                          onChange={setNewDateValue}
                          label={t('calendar.newDateLabel')}
                          testID={`calendar-date-input-${mission.id}`}
                        />
                        <View style={styles.editRow}>
                          <AnimatedPressable
                            onPress={() => handleSaveDate(mission.id)}
                            testID={`calendar-date-save-${mission.id}`}
                            style={styles.saveButton}
                          >
                            <Text style={styles.saveButtonText}>{t('calendar.save')}</Text>
                          </AnimatedPressable>
                          <AnimatedPressable
                            onPress={() => setEditingMissionId(null)}
                            testID={`calendar-date-cancel-${mission.id}`}
                            style={styles.cancelButton}
                          >
                            <Text style={styles.cancelButtonText}>{t('calendar.cancel')}</Text>
                          </AnimatedPressable>
                        </View>
                        <Text style={styles.dateInputLabel}>{isAdmin ? t('calendar.reassignTo') : t('calendar.suggestReassign')}</Text>
                        <View style={styles.chipRow}>
                          {members
                            .filter((m) => m.id !== mission.assigned_to)
                            .map((m) => (
                              <AnimatedPressable
                                key={m.id}
                                onPress={() => handleReassign(mission.id, m.id)}
                                testID={`calendar-reassign-${mission.id}-${m.id}`}
                                style={styles.reassignChip}
                              >
                                <Text style={styles.reassignChipText}>{m.name}</Text>
                              </AnimatedPressable>
                            ))}
                        </View>
                        {scheduleError && (
                          <Text testID={`calendar-schedule-error-${mission.id}`} style={styles.errorText}>
                            {scheduleError}
                          </Text>
                        )}
                      </View>
                    )}
                  </Card>
                </FadeIn>
              );
            })}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  syncMessage: {
    ...type.caption,
    color: colors.textMuted,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    padding: 3,
  },
  segmentOption: {
    flex: 1,
    minHeight: 38,
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
  gridCard: {
    padding: spacing.md,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotOverflow: {
    backgroundColor: colors.textMuted,
  },
  dayPanel: {
    flex: 1,
    gap: spacing.sm,
  },
  dayPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dayPanelTitle: {
    ...type.subheading,
    color: colors.ink,
    flex: 1,
  },
  dayPanelCount: {
    ...type.caption,
    color: colors.textMuted,
  },
  dayList: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  missionCard: {
    gap: spacing.sm,
  },
  missionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  missionCardTitle: {
    ...type.bodyStrong,
    flex: 1,
    color: colors.ink,
  },
  missionCardPoints: {
    ...type.caption,
    fontWeight: '800',
    color: colors.textMuted,
  },
  assigneeText: {
    ...type.caption,
    color: colors.textMuted,
  },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
  },
  editLink: {
    ...type.caption,
    fontWeight: '700',
    color: sectionColors.calendar,
  },
  viewOnlyText: {
    ...type.caption,
    color: colors.textMuted,
  },
  dateInputLabel: {
    ...type.caption,
    color: colors.textMuted,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: sectionColors.calendar,
  },
  saveButtonText: {
    ...type.label,
    fontWeight: '800',
    color: colors.surface,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...type.label,
    fontWeight: '700',
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reassignChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  reassignChipText: {
    ...type.caption,
    color: colors.ink,
  },
  errorText: {
    ...type.caption,
    color: colors.rose,
  },
});
