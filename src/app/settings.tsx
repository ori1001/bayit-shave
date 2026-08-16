import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyMembership } from '../features/missions/api';
import {
  getHouseSettings,
  updateHouseSettings,
  type AssignmentStrategy,
  type BalancePeriod,
  type MemberWeight,
} from '../features/settings/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { LoadErrorView } from '../components/LoadErrorView';
import { LoadingScreen, FadeIn } from '../components/Motion';
import { colors, spacing, radii } from '../theme';

const STRATEGIES: AssignmentStrategy[] = ['points_based', 'round_robin', 'manual'];
const PERIODS: BalancePeriod[] = ['weekly', 'monthly'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [isAdmin, setIsAdmin] = useState(false);
  const [strategy, setStrategy] = useState<AssignmentStrategy>('points_based');
  const [period, setPeriod] = useState<BalancePeriod>('weekly');
  const [balanceDay, setBalanceDay] = useState(5);
  const [members, setMembers] = useState<MemberWeight[]>([]);
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      const membership = await getMyMembership(houseId);
      setIsAdmin(membership?.role === 'admin');
      const { house, members: houseMembers } = await getHouseSettings(houseId);
      setStrategy(house.assignment_strategy);
      setPeriod(house.balance_period);
      setBalanceDay(house.balance_day);
      setMembers(houseMembers);
      setWeightDrafts(Object.fromEntries(houseMembers.map((m) => [m.id, String(m.weight)])));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const member_weights = members
        .map((m) => ({ member_id: m.id, weight: Number(weightDrafts[m.id]) }))
        .filter((w) => Number.isFinite(w.weight) && w.weight > 0);

      const { members: updated } = await updateHouseSettings(houseId, {
        assignment_strategy: strategy,
        balance_period: period,
        balance_day: balanceDay,
        member_weights,
      });
      setMembers(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (loadError !== null) {
    return <LoadErrorView message={loadError} onRetry={load} testID="settings-load-error" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="settings-outline" size={26} color={colors.ink} />
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      {!isAdmin && (
        <Text testID="settings-admin-only" style={styles.adminOnlyText}>
          {t('settings.adminOnly')}
        </Text>
      )}

      <Text style={styles.label}>{t('settings.strategyLabel')}</Text>
      <View style={styles.chipRow}>
        {STRATEGIES.map((option) => (
          <AnimatedPressable
            key={option}
            onPress={() => setStrategy(option)}
            disabled={!isAdmin}
            testID={`strategy-${option}`}
            style={[styles.chip, strategy === option && styles.chipActive]}
          >
            <Text style={[styles.chipText, strategy === option && styles.chipTextActive]}>
              {t(`settings.strategy_${option}`)}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={styles.label}>{t('settings.periodLabel')}</Text>
      <View style={styles.chipRow}>
        {PERIODS.map((option) => (
          <AnimatedPressable
            key={option}
            onPress={() => setPeriod(option)}
            disabled={!isAdmin}
            testID={`period-${option}`}
            style={[styles.chip, period === option && styles.chipActive]}
          >
            <Text style={[styles.chipText, period === option && styles.chipTextActive]}>
              {t(`settings.period_${option}`)}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={styles.label}>{t('settings.balanceDayLabel')}</Text>
      <View style={styles.chipRow}>
        {DAYS.map((day) => (
          <AnimatedPressable
            key={day}
            onPress={() => setBalanceDay(day)}
            disabled={!isAdmin}
            testID={`balance-day-${day}`}
            style={[styles.dayChip, balanceDay === day && styles.chipActive]}
          >
            <Text style={[styles.chipText, balanceDay === day && styles.chipTextActive]}>{t(`settings.day_${day}`)}</Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={styles.label}>{t('settings.weightsLabel')}</Text>
      <Text style={styles.hint}>{t('settings.weightHint')}</Text>
      {members.map((member) => (
        <Card key={member.id} testID={`member-weight-${member.id}`} style={styles.weightRow}>
          <Text style={styles.memberName}>{member.name}</Text>
          <TextInput
            value={weightDrafts[member.id] ?? ''}
            onChangeText={(value) => setWeightDrafts((prev) => ({ ...prev, [member.id]: value }))}
            keyboardType="numeric"
            editable={isAdmin}
            testID={`member-weight-input-${member.id}`}
            style={styles.weightInput}
          />
        </Card>
      ))}

      {saveError && (
        <Text testID="settings-save-error" style={styles.errorText}>
          {saveError}
        </Text>
      )}
      {saved && (
        <Text testID="settings-saved" style={styles.savedText}>
          {t('settings.saved')}
        </Text>
      )}

      {isAdmin && (
        <AnimatedPressable onPress={handleSave} disabled={saving} testID="settings-save" style={styles.saveButton}>
          <Ionicons name="save-outline" size={18} color={colors.cream} />
          <Text style={styles.saveButtonText}>{t('settings.save')}</Text>
        </AnimatedPressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  adminOnlyText: {
    color: colors.amber,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 44,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  chipText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.cream,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    flex: 1,
    color: colors.ink,
    fontWeight: '700',
  },
  weightInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    width: 72,
    textAlign: 'center',
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  errorText: {
    color: colors.rose,
  },
  savedText: {
    color: colors.sage,
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  saveButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
});
