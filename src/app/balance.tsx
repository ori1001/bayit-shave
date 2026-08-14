import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyMembership } from '../features/missions/api';
import { getPointsPool, getOpenMissions, runBalance, assignMission, type PointsPoolEntry, type OpenMission } from '../features/balance/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { LoadErrorView } from '../components/LoadErrorView';
import { colors, spacing, radii } from '../theme';

export default function BalanceScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [pool, setPool] = useState<PointsPoolEntry[]>([]);
  const [openMissions, setOpenMissions] = useState<OpenMission[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      const membership = await getMyMembership(houseId);
      setIsAdmin(membership?.role === 'admin');
      const [poolRows, missions] = await Promise.all([getPointsPool(houseId), getOpenMissions(houseId)]);
      setPool(poolRows);
      setOpenMissions(missions);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleRunBalance() {
    setRunning(true);
    try {
      await runBalance(houseId);
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function handleManualAssign(missionId: string, memberId: string) {
    await assignMission(missionId, memberId);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (loadError !== null) {
    return <LoadErrorView message={loadError} onRetry={load} testID="balance-load-error" />;
  }

  // House-level view of the pool: the spec asks for total points in play and
  // whether the house is balanced, not just the per-member breakdown.
  const houseEarned = pool.reduce((sum, p) => sum + p.points_earned, 0);
  const houseTarget = pool.reduce((sum, p) => sum + p.points_target + p.debt, 0);
  const houseBalanced = pool.every((p) => p.points_earned >= p.points_target + p.debt);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('balance.title')}</Text>
      <Card testID="balance-house-summary" style={styles.summaryCard}>
        <View style={styles.rowHeader}>
          <Ionicons
            name={houseBalanced ? 'checkmark-circle' : 'hourglass-outline'}
            size={18}
            color={houseBalanced ? colors.sage : colors.rose}
          />
          <Text style={styles.memberName}>{t(houseBalanced ? 'balance.houseBalanced' : 'balance.houseImbalanced')}</Text>
        </View>
        <Text style={styles.detailText}>
          {t('balance.houseTotalEarned')}: {houseEarned} · {t('balance.houseTotalTarget')}: {Math.round(houseTarget)}
        </Text>
      </Card>
      <FlatList
        data={pool}
        keyExtractor={(p) => p.member_id}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => {
          const target = item.points_target + item.debt;
          const behind = target - item.points_earned;
          const progress = target > 0 ? Math.min(1, Math.max(0, item.points_earned / target)) : 1;
          const onTrack = behind <= 0;
          return (
            <Card testID={`balance-row-${item.member_id}`} style={styles.row}>
              <View style={styles.rowHeader}>
                <Ionicons name={onTrack ? 'checkmark-circle' : 'hourglass-outline'} size={18} color={onTrack ? colors.sage : colors.rose} />
                <Text style={styles.memberName}>{item.name}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: onTrack ? colors.sage : colors.rose }]} />
              </View>
              <Text style={styles.detailText}>
                {t('balance.earned')}: {item.points_earned} · {t('balance.target')}: {Math.round(item.points_target)}
                {item.debt > 0 ? ` · ${t('balance.debt')}: ${item.debt}` : ''}
              </Text>
              <Text style={styles.detailText}>{behind > 0 ? `${t('balance.behindBy')} ${Math.round(behind)}` : t('balance.onTrack')}</Text>
            </Card>
          );
        }}
      />
      {isAdmin && (
        <AnimatedPressable onPress={handleRunBalance} disabled={running} testID="run-balance" style={styles.primaryButton}>
          <Ionicons name="shuffle-outline" size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('balance.runBalance')}</Text>
        </AnimatedPressable>
      )}
      {isAdmin && openMissions.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{t('balance.openMissions')}</Text>
          {openMissions.map((m) => (
            <View key={m.id} testID={`open-mission-${m.id}`} style={styles.openMissionRow}>
              <Text style={styles.openMissionText}>
                {m.title} · {m.points}
              </Text>
              <View style={styles.chipRow}>
                {pool.map((p) => (
                  <AnimatedPressable key={p.member_id} onPress={() => handleManualAssign(m.id, p.member_id)} testID={`assign-${m.id}-${p.member_id}`} style={styles.chip}>
                    <Text style={styles.chipText}>{p.name}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
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
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  row: {
    gap: spacing.xs,
  },
  summaryCard: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    fontWeight: '700',
    color: colors.ink,
  },
  progressTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  detailText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontWeight: '700',
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
  openMissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  openMissionText: {
    flex: 1,
    color: colors.ink,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
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
});

