import { useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runBalance, assignMission } from '../features/balance/api';
import { fetchBalance, balanceKey } from '../features/tabs-data';
import { useScreenData } from '../lib/screen-data';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import * as haptics from '../lib/haptics';
import { Screen } from '../components/Screen';
import { FadeIn } from '../components/Motion';
import { colors, spacing, radii, type, sectionColors, stateColors, ICONS, tint } from '../theme';

export default function BalanceScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const load = useCallback(() => fetchBalance(houseId), [houseId]);

  const { data, fromCache, loading, error, refresh, update } = useScreenData(balanceKey(houseId), load);

  const pool = useMemo(() => data?.pool ?? [], [data]);
  const openMissions = useMemo(() => data?.openMissions ?? [], [data]);
  const isAdmin = data?.isAdmin;

  async function handleRunBalance() {
    await runBalance(houseId);
    haptics.success();
    await refresh();
  }

  async function handleManualAssign(missionId: string, memberId: string) {
    // Taken off the open list straight away -- it has an owner now, and waiting
    // for the refetch to remove it made the tap look like it had missed.
    update((current) => ({ ...current, openMissions: current.openMissions.filter((m) => m.id !== missionId) }));
    await assignMission(missionId, memberId);
    await refresh();
  }

  // House-level view of the pool: the spec asks for total points in play and
  // whether the house is balanced, not just the per-member breakdown.
  const houseEarned = pool.reduce((sum, p) => sum + p.points_earned, 0);
  const houseTarget = pool.reduce((sum, p) => sum + p.points_target + p.debt, 0);
  const houseBalanced = pool.length > 0 && pool.every((p) => p.points_earned >= p.points_target + p.debt);
  const houseProgress = houseTarget > 0 ? Math.min(1, houseEarned / houseTarget) : 1;

  return (
    <Screen
      section="balance"
      title={t('balance.title')}
      icon={ICONS.balance}
      tab="balance"
      houseId={houseId}
      isAdmin={isAdmin}
      loading={loading}
      error={error}
      onRetry={refresh}
      errorTestID="balance-load-error"
    >
      {pool.length > 0 && (
        <Card
          testID="balance-house-summary"
          style={[styles.summaryCard, { backgroundColor: tint(houseBalanced ? stateColors.done : colors.amber, '14') }]}
        >
          <View style={styles.rowHeader}>
            <View style={[styles.summaryIcon, { backgroundColor: houseBalanced ? stateColors.done : colors.amber }]}>
              <Ionicons name={houseBalanced ? ICONS.done : ICONS.awaiting} size={20} color={colors.surface} />
            </View>
            <Text style={styles.summaryTitle}>
              {t(houseBalanced ? 'balance.houseBalanced' : 'balance.houseImbalanced')}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${houseProgress * 100}%`, backgroundColor: houseBalanced ? stateColors.done : colors.amber },
              ]}
            />
          </View>
          <Text style={styles.detailText}>
            {t('balance.houseTotalEarned')}: {houseEarned} · {t('balance.houseTotalTarget')}: {Math.round(houseTarget)}
          </Text>
        </Card>
      )}

      <FlatList
        data={pool}
        keyExtractor={(p) => p.member_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={ICONS.house}
            tone={sectionColors.balance}
            title={t('balance.emptyTitle')}
            body={t('balance.emptyBody')}
            testID="balance-empty"
          />
        }
        renderItem={({ item, index }) => {
          const target = item.points_target + item.debt;
          const behind = target - item.points_earned;
          const progress = target > 0 ? Math.min(1, Math.max(0, item.points_earned / target)) : 1;
          const onTrack = behind <= 0;
          return (
            <FadeIn index={index} skip={fromCache}>
              <Card testID={`balance-row-${item.member_id}`} style={styles.row}>
                <View style={styles.rowHeader}>
                  <Avatar memberId={item.member_id} name={item.name} size={34} />
                  <Text style={styles.memberName}>{item.name}</Text>
                  <View style={[styles.trend, { backgroundColor: tint(onTrack ? stateColors.done : stateColors.overdue, '1A') }]}>
                    <Ionicons
                      name={onTrack ? ICONS.ahead : ICONS.behind}
                      size={15}
                      color={onTrack ? stateColors.done : stateColors.overdue}
                    />
                    <Text style={[styles.trendText, { color: onTrack ? stateColors.done : stateColors.overdue }]}>
                      {onTrack ? `+${Math.round(-behind)}` : `-${Math.round(behind)}`}
                    </Text>
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progress * 100}%`, backgroundColor: onTrack ? stateColors.done : stateColors.overdue },
                    ]}
                  />
                </View>
                <Text style={styles.detailText}>
                  {t('balance.earned')}: {item.points_earned} · {t('balance.target')}: {Math.round(item.points_target)}
                  {item.debt > 0 ? ` · ${t('balance.debt')}: ${item.debt}` : ''}
                </Text>
                <Text style={styles.detailText}>
                  {behind > 0 ? `${t('balance.behindBy')} ${Math.round(behind)}` : t('balance.onTrack')}
                </Text>
              </Card>
            </FadeIn>
          );
        }}
      />

      {isAdmin && openMissions.length > 0 && (
        <View style={styles.openBlock}>
          <Text style={styles.sectionTitle}>{t('balance.openMissions')}</Text>
          {openMissions.map((m) => (
            <Card key={m.id} testID={`open-mission-${m.id}`} style={styles.openMissionCard}>
              <Text style={styles.openMissionText}>
                {m.title} · {m.points}
              </Text>
              <View style={styles.chipRow}>
                {pool.map((p) => (
                  <AnimatedPressable
                    key={p.member_id}
                    onPress={() => handleManualAssign(m.id, p.member_id)}
                    testID={`assign-${m.id}-${p.member_id}`}
                    style={styles.chip}
                  >
                    <Avatar memberId={p.member_id} name={p.name} size={20} />
                    <Text style={styles.chipText}>{p.name}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </Card>
          ))}
        </View>
      )}

      {isAdmin && (
        <AnimatedPressable onPress={handleRunBalance} testID="run-balance" style={styles.primaryButton}>
          <Ionicons name="shuffle-outline" size={20} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('balance.runBalance')}</Text>
        </AnimatedPressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    gap: spacing.sm,
    borderWidth: 0,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    ...type.subheading,
    color: colors.ink,
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  row: {
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    ...type.bodyStrong,
    color: colors.ink,
    flex: 1,
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  trendText: {
    ...type.caption,
    fontWeight: '800',
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
  detailText: {
    ...type.caption,
    color: colors.textMuted,
  },
  sectionTitle: {
    ...type.subheading,
    color: colors.ink,
  },
  openBlock: {
    gap: spacing.sm,
  },
  openMissionCard: {
    gap: spacing.sm,
  },
  openMissionText: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 40,
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
    backgroundColor: sectionColors.balance,
    borderRadius: radii.lg,
    minHeight: 52,
  },
  primaryButtonText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
});
