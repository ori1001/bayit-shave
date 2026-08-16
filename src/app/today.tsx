import { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyHouseId, getMyMembership, getTodayMissions, getHouseMembers, editMissionPoints, type Mission } from '../features/missions/api';
import { completeMissionWithQueue, drainQueue, readQueue } from '../features/offline/queue';
import * as haptics from '../lib/haptics';
import { getMyIncomingSwaps, suggestSwap, respondSwap, type SwapRequest } from '../features/requests/api';
import { registerForPushNotifications } from '../features/notifications/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { CategoryIcon } from '../components/CategoryIcon';
import { MissionRow } from '../components/MissionRow';
import { TabBar } from '../components/TabBar';
import { MoreSheet } from '../components/MoreSheet';
import { LoadErrorView } from '../components/LoadErrorView';
import { LoadingScreen, FadeIn } from '../components/Motion';
import { colors, spacing, radii, sectionColors, ICONS } from '../theme';

/** Maps a mission onto the shared row's visual state. */
function rowStateFor(mission: Mission): 'done' | 'overdue' | 'proposed' | 'open' {
  if (mission.status === 'done') return 'done';
  if (mission.proposed_points !== null || mission.proposed_due_date || mission.proposed_assigned_to) return 'proposed';
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (mission.due_date < todayStr) return 'overdue';
  return 'open';
}

export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editPointsValue, setEditPointsValue] = useState('');
  const [pointsEditFeedback, setPointsEditFeedback] = useState<string | null>(null);
  const [pointsEditError, setPointsEditError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [incomingSwaps, setIncomingSwaps] = useState<SwapRequest[]>([]);
  const [swappingMissionId, setSwappingMissionId] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      // Any completions taken while offline go out before we read state back,
      // so the list reflects them once connectivity returns.
      const { remaining } = await drainQueue();
      setPendingSyncCount(remaining);
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
        // Push is best-effort: a declined permission or a device that cannot
        // mint a token must not stop the screen from loading.
        registerForPushNotifications(membership.id).catch(() => {});
        const [todayMissions, houseMembers, swaps] = await Promise.all([
          getTodayMissions(hId, membership.id),
          getHouseMembers(hId),
          getMyIncomingSwaps(hId, membership.id),
        ]);
        setMissions(todayMissions);
        setMembers(houseMembers);
        setIncomingSwaps(swaps);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleComplete(missionId: string) {
    // Fires before the round-trip: the completion is already recorded locally
    // (queued if offline), so the tap has genuinely landed by the time it is
    // felt. Waiting on the network would make the app's fastest action feel slow.
    haptics.success();
    setJustCompletedId(missionId);
    setTimeout(() => setJustCompletedId(null), 700);

    const { synced } = await completeMissionWithQueue(missionId);
    // An unsynced tap is recorded locally, not lost, so say so rather than
    // failing silently or pretending the mission is done on the server.
    setPendingSyncCount(synced ? 0 : (await readQueue()).length);
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
      haptics.error();
      setPointsEditError(e instanceof Error ? e.message : t('missions.editPointsError'));
    }
  }

  async function handleRequestSwap(missionId: string, toMemberId: string) {
    await suggestSwap(missionId, toMemberId);
    setSwappingMissionId(null);
    await load();
  }

  async function handleRespondSwap(swapId: string, decision: 'accept' | 'decline') {
    haptics.decide();
    await respondSwap(swapId, decision);
    await load();
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (loadError !== null) {
    return <LoadErrorView message={loadError} onRetry={load} testID="today-load-error" />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.greeting}>{t('today.greeting')}</Text>
      {pendingSyncCount > 0 && (
        <Text testID="today-pending-sync" style={styles.pendingSyncText}>
          {t('today.pendingSync', { count: pendingSyncCount })}
        </Text>
      )}
      {incomingSwaps.length > 0 && (
        <Card style={styles.swapCard}>
          <Text style={styles.sectionTitle}>{t('swap.incomingTitle')}</Text>
          {incomingSwaps.map((swap) => (
            <View key={swap.id} testID={`incoming-swap-${swap.id}`} style={styles.swapRow}>
              <Text style={styles.swapFromName}>{members.find((m) => m.id === swap.from_member)?.name ?? swap.from_member}</Text>
              <AnimatedPressable onPress={() => handleRespondSwap(swap.id, 'accept')} testID={`accept-swap-${swap.id}`} style={styles.iconButton} accessibilityLabel={t('swap.accept')}>
                <Ionicons name="checkmark-circle" size={22} color={colors.sage} />
              </AnimatedPressable>
              <AnimatedPressable onPress={() => handleRespondSwap(swap.id, 'decline')} testID={`decline-swap-${swap.id}`} style={styles.iconButton} accessibilityLabel={t('swap.decline')}>
                <Ionicons name="close-circle" size={22} color={colors.rose} />
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
        contentContainerStyle={{ gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('today.noMissions')}</Text>}
        renderItem={({ item, index }) => (
          <FadeIn index={index} style={{ gap: spacing.xs }}>
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
                <Ionicons name={ICONS.edit} size={14} color={colors.textMuted} />
                <Text style={styles.smallActionText}>{t('missions.editPoints')}</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => setSwappingMissionId(item.id)} testID={`swap-${item.id}`} style={styles.smallAction} accessibilityLabel={t('swap.requestSwap')}>
                <Ionicons name={ICONS.swap} size={14} color={sectionColors.calendar} />
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
        <Ionicons name={ICONS.add} size={18} color={colors.cream} />
        <Text style={styles.primaryButtonText}>{t('today.suggestMission')}</Text>
      </AnimatedPressable>

      <TabBar
        active="today"
        houseId={houseId ?? ''}
        isAdmin={isAdmin}
        inboxCount={incomingSwaps.length}
        onMore={() => setMoreOpen(true)}
      />

      <MoreSheet visible={moreOpen} onClose={() => setMoreOpen(false)} houseId={houseId ?? ''} isAdmin={isAdmin} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionTitle: {
    fontWeight: '700',
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
    color: colors.ink,
  },
  iconButton: {
    padding: spacing.xs,
  },
  feedbackText: {
    color: colors.sage,
  },
  pendingSyncText: {
    color: colors.amber,
    fontSize: 12,
  },
  errorText: {
    color: colors.rose,
  },
  emptyText: {
    color: colors.textMuted,
  },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  missionTitle: {
    flex: 1,
    fontWeight: '700',
    color: colors.ink,
  },
  missionPoints: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingStart: spacing.xl,
  },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  smallActionText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  inlineEditRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingStart: 32,
    alignItems: 'center',
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    width: 80,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  saveText: {
    color: colors.sage,
    fontWeight: '700',
  },
  cancelText: {
    color: colors.rose,
    fontWeight: '700',
  },
  swapTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingStart: 32,
  },
  swapTargetLabel: {
    width: '100%',
    fontSize: 12,
    color: colors.textMuted,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontSize: 11,
    color: colors.ink,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  primaryButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  secondaryButtonText: {
    fontWeight: '700',
  },
});
