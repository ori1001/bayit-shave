import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getMyHouseId,
  getMyMembership,
  getTodayMissions,
  getHouseMembers,
  editMissionPoints,
  localDateString,
  type Mission,
} from '../features/missions/api';
import { completeMissionWithQueue, drainQueue, readQueue } from '../features/offline/queue';
import * as haptics from '../lib/haptics';
import { getMyIncomingSwaps, suggestSwap, respondSwap, type SwapRequest } from '../features/requests/api';
import { registerForPushNotifications } from '../features/notifications/api';
import { prefetchTabs } from '../features/tabs-data';
import { useScreenData } from '../lib/screen-data';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { MissionRow } from '../components/MissionRow';
import { Screen } from '../components/Screen';
import { localeOf } from '../components/MonthGrid';
import { FadeIn, Pop } from '../components/Motion';
import { colors, spacing, radii, type, sectionColors, stateColors, ICONS, tint } from '../theme';

type HouseMember = { id: string; name: string; role: 'admin' | 'member' };

interface TodayData {
  houseId: string | null;
  isAdmin: boolean;
  myMemberId: string | null;
  missions: Mission[];
  members: HouseMember[];
  incomingSwaps: SwapRequest[];
  pendingSync: number;
}

const EMPTY: TodayData = {
  houseId: null,
  isAdmin: false,
  myMemberId: null,
  missions: [],
  members: [],
  incomingSwaps: [],
  pendingSync: 0,
};

/** Maps a mission onto the shared row's visual state. */
function rowStateFor(mission: Mission): 'done' | 'overdue' | 'proposed' | 'open' {
  if (mission.status === 'done') return 'done';
  if (mission.proposed_points !== null || mission.proposed_due_date || mission.proposed_assigned_to) return 'proposed';
  if (mission.due_date < localDateString()) return 'overdue';
  return 'open';
}

async function fetchToday(): Promise<TodayData> {
  // Any completions taken while offline go out before we read state back,
  // so the list reflects them once connectivity returns.
  const { remaining } = await drainQueue();
  const houseId = await getMyHouseId();
  if (!houseId) {
    return { ...EMPTY, pendingSync: remaining };
  }
  const membership = await getMyMembership(houseId);
  if (!membership) {
    return { ...EMPTY, houseId, pendingSync: remaining };
  }
  // Push is best-effort: a declined permission or a device that cannot mint a
  // token must not stop the screen from loading.
  registerForPushNotifications(membership.id).catch(() => {});
  // Warms the other tabs while the user reads this one, so their first visit
  // paints instantly rather than being the one load left in the app.
  prefetchTabs(houseId);
  const [missions, members, incomingSwaps] = await Promise.all([
    getTodayMissions(houseId, membership.id),
    getHouseMembers(houseId),
    getMyIncomingSwaps(houseId, membership.id),
  ]);
  return {
    houseId,
    isAdmin: membership.role === 'admin',
    myMemberId: membership.id,
    missions,
    members,
    incomingSwaps,
    pendingSync: remaining,
  };
}

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, fromCache, loading, error, refresh, update } = useScreenData('today', fetchToday);

  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editPointsValue, setEditPointsValue] = useState('');
  const [pointsEditFeedback, setPointsEditFeedback] = useState<string | null>(null);
  const [pointsEditError, setPointsEditError] = useState<string | null>(null);
  const [swappingMissionId, setSwappingMissionId] = useState<string | null>(null);

  const houseId = data?.houseId ?? null;
  const isAdmin = data?.isAdmin;
  const missions = useMemo(() => data?.missions ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);
  const incomingSwaps = useMemo(() => data?.incomingSwaps ?? [], [data]);
  const myMemberId = data?.myMemberId ?? null;
  const pendingSyncCount = data?.pendingSync ?? 0;

  useEffect(() => {
    // Signed in but not in a house: the entry screen is where you create or
    // join one. Done as an effect rather than inside the fetch, so navigating
    // is never a side effect of filling a cache.
    if (data && data.houseId === null) {
      router.replace('/');
    }
  }, [data, router]);

  const done = missions.filter((m) => m.status === 'done');
  const pointsToday = done.reduce((sum, m) => sum + m.points, 0);
  const progress = missions.length > 0 ? done.length / missions.length : 0;

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(localeOf(i18n.language), { weekday: 'long', day: 'numeric', month: 'long' }),
    [i18n.language]
  );

  async function handleComplete(missionId: string) {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission || mission.status === 'done') {
      return;
    }

    // Fires before the round-trip: the completion is already recorded locally
    // (queued if offline), so the tap has genuinely landed by the time it is
    // felt. Waiting on the network would make the app's fastest action feel slow.
    haptics.success();
    setJustCompletedId(missionId);
    setTimeout(() => setJustCompletedId(null), 700);
    // Marked done here rather than after the refetch. The server answer never
    // differs -- a completion is unconditional -- so waiting for it would only
    // delay the one piece of feedback the user is looking for.
    update((current) => ({
      ...current,
      missions: current.missions.map((m) => (m.id === missionId ? { ...m, status: 'done' } : m)),
    }));

    const { synced } = await completeMissionWithQueue(missionId);
    const pending = synced ? 0 : (await readQueue()).length;
    update((current) => ({ ...current, pendingSync: pending }));
    await refresh();
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
      await refresh();
    } catch (e) {
      haptics.error();
      setPointsEditError(e instanceof Error ? e.message : t('missions.editPointsError'));
    }
  }

  async function handleRequestSwap(missionId: string, toMemberId: string) {
    setSwappingMissionId(null);
    await suggestSwap(missionId, toMemberId);
    await refresh();
  }

  async function handleRespondSwap(swapId: string, decision: 'accept' | 'decline') {
    haptics.decide();
    // Dropped from the list first: the decision is taken, and leaving it on
    // screen until the refetch returns reads as the tap not registering.
    update((current) => ({ ...current, incomingSwaps: current.incomingSwaps.filter((s) => s.id !== swapId) }));
    await respondSwap(swapId, decision);
    await refresh();
  }

  return (
    <Screen
      section="today"
      title={t('today.greeting')}
      subtitle={dateLabel}
      icon={ICONS.today}
      tab="today"
      houseId={houseId ?? ''}
      isAdmin={isAdmin}
      inboxCount={incomingSwaps.length}
      loading={loading}
      error={error}
      onRetry={refresh}
      errorTestID="today-load-error"
      headerRight={
        missions.length > 0 ? (
          <Pop trigger={pointsToday} style={[styles.pointsPill, { backgroundColor: tint(sectionColors.today, '24') }]}>
            <Ionicons name={ICONS.points} size={14} color={colors.ink} />
            <Text style={styles.pointsPillText}>{t('today.pointsToday', { count: pointsToday })}</Text>
          </Pop>
        ) : null
      }
    >
      {missions.length > 0 && (
        <View style={styles.progressBlock}>
          <Text style={styles.progressLabel}>
            {progress === 1 ? t('today.allDone') : t('today.progress', { done: done.length, total: missions.length })}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: progress === 1 ? stateColors.done : sectionColors.today },
              ]}
            />
          </View>
        </View>
      )}

      {pendingSyncCount > 0 && (
        <View testID="today-pending-sync" style={styles.syncPill}>
          <Ionicons name={ICONS.offline} size={16} color={colors.amber} />
          <Text style={styles.syncPillText}>{t('today.pendingSync', { count: pendingSyncCount })}</Text>
        </View>
      )}

      {incomingSwaps.length > 0 && (
        <Card style={[styles.swapCard, { borderStartWidth: 3, borderStartColor: sectionColors.calendar }]}>
          <Text style={styles.sectionTitle}>{t('swap.incomingTitle')}</Text>
          {incomingSwaps.map((swap) => (
            <View key={swap.id} testID={`incoming-swap-${swap.id}`} style={styles.swapRow}>
              <Text style={styles.swapFromName}>
                {members.find((m) => m.id === swap.from_member)?.name ?? swap.from_member}
              </Text>
              <AnimatedPressable
                onPress={() => handleRespondSwap(swap.id, 'accept')}
                testID={`accept-swap-${swap.id}`}
                style={styles.iconButton}
                accessibilityLabel={t('swap.accept')}
              >
                <Ionicons name="checkmark-circle" size={26} color={stateColors.done} />
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => handleRespondSwap(swap.id, 'decline')}
                testID={`decline-swap-${swap.id}`}
                style={styles.iconButton}
                accessibilityLabel={t('swap.decline')}
              >
                <Ionicons name="close-circle" size={26} color={colors.rose} />
              </AnimatedPressable>
            </View>
          ))}
        </Card>
      )}

      {pointsEditFeedback && (
        <Text testID="points-edit-feedback" style={styles.feedbackText}>
          {pointsEditFeedback}
        </Text>
      )}
      {pointsEditError && (
        <Text testID="points-edit-error" style={styles.errorText}>
          {pointsEditError}
        </Text>
      )}

      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={ICONS.today}
            tone={sectionColors.today}
            title={t('today.emptyTitle')}
            body={t('today.emptyBody')}
            testID="today-empty"
          />
        }
        renderItem={({ item, index }) => (
          <FadeIn index={index} skip={fromCache} style={{ gap: spacing.xs }}>
            <AnimatedPressable onPress={() => handleComplete(item.id)} testID={`mission-row-${item.id}`}>
              <MissionRow
                title={item.title}
                category={item.category}
                points={item.points}
                state={justCompletedId === item.id ? 'done' : rowStateFor(item)}
                assigneeId={item.assigned_to}
                assigneeName={members.find((m) => m.id === item.assigned_to)?.name}
              />
            </AnimatedPressable>
            <View style={styles.rowActions}>
              <AnimatedPressable onPress={() => startEditPoints(item)} testID={`edit-points-${item.id}`} style={styles.smallAction}>
                <Ionicons name={ICONS.edit} size={16} color={colors.textMuted} />
                <Text style={styles.smallActionText}>{t('missions.editPoints')}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setSwappingMissionId(item.id)}
                testID={`swap-${item.id}`}
                style={styles.smallAction}
                accessibilityLabel={t('swap.requestSwap')}
              >
                <Ionicons name={ICONS.swap} size={16} color={sectionColors.calendar} />
                <Text style={styles.smallActionText}>{t('swap.requestSwap')}</Text>
              </AnimatedPressable>
            </View>
            {editingMissionId === item.id && (
              <View style={styles.inlineEditRow}>
                <TextInput
                  value={editPointsValue}
                  onChangeText={setEditPointsValue}
                  keyboardType="numeric"
                  testID={`edit-points-input-${item.id}`}
                  style={styles.inlineInput}
                />
                <AnimatedPressable onPress={() => handleSaveEditPoints(item.id)} testID={`edit-points-save-${item.id}`} style={styles.smallAction}>
                  <Text style={styles.saveText}>{t('missions.save')}</Text>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => setEditingMissionId(null)} testID={`edit-points-cancel-${item.id}`} style={styles.smallAction}>
                  <Text style={styles.cancelText}>{t('missions.cancel')}</Text>
                </AnimatedPressable>
              </View>
            )}
            {swappingMissionId === item.id && (
              <View style={styles.swapTargetRow}>
                <Text style={styles.swapTargetLabel}>{t('swap.selectMember')}</Text>
                {members
                  .filter((m) => m.id !== myMemberId)
                  .map((m) => (
                    <AnimatedPressable
                      key={m.id}
                      onPress={() => handleRequestSwap(item.id, m.id)}
                      testID={`swap-target-${item.id}-${m.id}`}
                      style={styles.chip}
                    >
                      <Text style={styles.chipText}>{m.name}</Text>
                    </AnimatedPressable>
                  ))}
              </View>
            )}
          </FadeIn>
        )}
      />

      <AnimatedPressable
        onPress={() => router.push({ pathname: '/missions/suggest', params: { houseId: houseId ?? '' } })}
        testID="today-suggest-mission"
        style={styles.primaryButton}
      >
        <Ionicons name={ICONS.add} size={20} color={colors.cream} />
        <Text style={styles.primaryButtonText}>{t('today.suggestMission')}</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  pointsPillText: {
    ...type.caption,
    fontWeight: '800',
    color: colors.ink,
  },
  progressBlock: {
    gap: spacing.xs,
  },
  progressLabel: {
    ...type.caption,
    color: colors.textMuted,
  },
  progressTrack: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  sectionTitle: {
    ...type.subheading,
    color: colors.ink,
  },
  swapCard: {
    gap: spacing.sm,
  },
  swapRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  swapFromName: {
    flex: 1,
    ...type.body,
    color: colors.ink,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackText: {
    ...type.body,
    color: stateColors.done,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: tint(colors.amber, '1F'),
  },
  syncPillText: {
    ...type.caption,
    color: colors.ink,
  },
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingStart: spacing.md,
  },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.xs,
  },
  smallActionText: {
    ...type.caption,
    color: colors.textMuted,
  },
  inlineEditRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingStart: spacing.md,
    alignItems: 'center',
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    width: 90,
    backgroundColor: colors.surface,
    ...type.body,
    color: colors.ink,
  },
  saveText: {
    ...type.label,
    color: stateColors.done,
    fontWeight: '700',
  },
  cancelText: {
    ...type.label,
    color: colors.rose,
    fontWeight: '700',
  },
  swapTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingStart: spacing.md,
  },
  swapTargetLabel: {
    width: '100%',
    ...type.caption,
    color: colors.textMuted,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  chipText: {
    ...type.caption,
    color: colors.ink,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
});
