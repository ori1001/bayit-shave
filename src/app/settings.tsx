import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearSessionCaches } from '../features/auth/session';
import {
  updateHouseSettings,
  transferAdmin,
  type AssignmentStrategy,
  type BalancePeriod,
  type MemberWeight,
} from '../features/settings/api';
import { fetchSettings, settingsKey } from '../features/tabs-data';
import { setLanguage } from '../i18n';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/language';
import { useScreenData } from '../lib/screen-data';
import * as haptics from '../lib/haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { weekdayName } from '../lib/recurrence';
import { colors, spacing, radii, type, sectionColors, ICONS, tint } from '../theme';

const STRATEGIES: AssignmentStrategy[] = ['points_based', 'round_robin', 'manual'];
const PERIODS: BalancePeriod[] = ['weekly', 'monthly'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const load = useCallback(() => fetchSettings(houseId), [houseId]);

  const { data, loading, error, refresh, update } = useScreenData(settingsKey(houseId), load);

  const members = useMemo(() => data?.members ?? [], [data]);
  const isAdmin = data?.isAdmin;
  const myMemberId = data?.myMemberId ?? null;

  const [strategy, setStrategy] = useState<AssignmentStrategy | null>(null);
  const [period, setPeriod] = useState<BalancePeriod | null>(null);
  const [balanceDay, setBalanceDay] = useState<number | null>(null);
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [languageNeedsRestart, setLanguageNeedsRestart] = useState(false);
  const [confirmTransferTo, setConfirmTransferTo] = useState<MemberWeight | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);

  // Drafts start as null and adopt the loaded values once. Re-seeding them on
  // every data change would discard an edit in progress the moment a background
  // refresh landed.
  useEffect(() => {
    if (!data) {
      return;
    }
    setStrategy((current) => current ?? data.house.assignment_strategy);
    setPeriod((current) => current ?? data.house.balance_period);
    setBalanceDay((current) => current ?? data.house.balance_day);
    setWeightDrafts((current) =>
      Object.keys(current).length > 0 ? current : Object.fromEntries(data.members.map((m) => [m.id, String(m.weight)]))
    );
  }, [data]);

  async function handleLanguage(language: SupportedLanguage) {
    if (language === i18n.language) {
      return;
    }
    const { needsRestart } = await setLanguage(language);
    // Text swaps immediately; the writing direction is a native setting React
    // Native only reads at launch, so a Hebrew/English switch needs a restart to
    // finish. Saying so beats leaving a half-mirrored layout unexplained.
    setLanguageNeedsRestart(needsRestart);
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const member_weights = members
        .map((m) => ({ member_id: m.id, weight: Number(weightDrafts[m.id]) }))
        .filter((w) => Number.isFinite(w.weight) && w.weight > 0);

      const { members: updated } = await updateHouseSettings(houseId, {
        ...(strategy ? { assignment_strategy: strategy } : {}),
        ...(period ? { balance_period: period } : {}),
        ...(balanceDay !== null ? { balance_day: balanceDay } : {}),
        member_weights,
      });
      update((current) => ({ ...current, members: updated }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : null);
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferAdmin(member: MemberWeight) {
    setSaveError(null);
    setConfirmTransferTo(null);
    try {
      const { members: updated } = await transferAdmin(houseId, member.id);
      haptics.success();
      // The caller is an ordinary member from this point, and their cached role
      // is what every screen's admin gate reads -- so it has to go, or the app
      // keeps offering controls the server will now refuse.
      clearSessionCaches();
      update((current) => ({ ...current, members: updated, isAdmin: false }));
      setTransferMessage(t('settings.transferred', { name: member.name }));
      setTimeout(() => setTransferMessage(null), 4000);
      await refresh();
    } catch (e) {
      haptics.error();
      setSaveError(e instanceof Error ? e.message : t('settings.transferError'));
    }
  }

  const otherMembers = members.filter((m) => m.id !== myMemberId);
  const currentAdmin = members.find((m) => m.role === 'admin');

  return (
    <Screen
      section="settings"
      title={t('settings.title')}
      icon={ICONS.settings}
      tab="more"
      houseId={houseId}
      isAdmin={isAdmin}
      scroll
      loading={loading}
      error={error}
      onRetry={refresh}
      errorTestID="settings-load-error"
    >
      {/* Language sits above the house settings and outside the admin gate: it
          is a personal preference, not a rule for the household. */}
      <Card style={styles.block}>
        <View style={styles.blockHeader}>
          <View style={[styles.blockIcon, { backgroundColor: tint(sectionColors.settings, '1F') }]}>
            <Ionicons name="language-outline" size={20} color={sectionColors.settings} />
          </View>
          <View style={styles.blockHeaderText}>
            <Text style={styles.blockTitle}>{t('settings.languageLabel')}</Text>
            <Text style={styles.hint}>{t('settings.languageHint')}</Text>
          </View>
        </View>
        <View style={styles.segment}>
          {SUPPORTED_LANGUAGES.map((language) => {
            const active = i18n.language === language;
            return (
              <AnimatedPressable
                key={language}
                onPress={() => handleLanguage(language)}
                testID={`language-${language}`}
                accessibilityState={{ selected: active }}
                style={[styles.segmentOption, active && styles.segmentOptionActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t(`settings.language_${language}`)}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
        {languageNeedsRestart && (
          <Text testID="language-restart-hint" style={styles.restartHint}>
            {t('settings.languageRestart')}
          </Text>
        )}
      </Card>

      {/* Who runs the house, and the handover. Shown to everyone: a member needs
          to know who to ask, and nothing in the app said so anywhere. */}
      <Card style={styles.block} testID="settings-admin-block">
        <View style={styles.blockHeader}>
          <View style={[styles.blockIcon, { backgroundColor: tint(sectionColors.settings, '1F') }]}>
            <Ionicons name={ICONS.admin} size={20} color={sectionColors.settings} />
          </View>
          <View style={styles.blockHeaderText}>
            <Text style={styles.blockTitle}>{t('settings.adminLabel')}</Text>
            <Text style={styles.hint}>{t('settings.adminHint')}</Text>
          </View>
        </View>

        {currentAdmin && (
          <View style={styles.adminRow} testID="settings-current-admin">
            <Avatar memberId={currentAdmin.id} name={currentAdmin.name} size={30} />
            <Text style={styles.memberName}>{currentAdmin.name}</Text>
            <View style={styles.adminTag}>
              <Text style={styles.adminTagText}>{t('settings.currentAdmin')}</Text>
            </View>
          </View>
        )}

        {isAdmin &&
          otherMembers.map((member) => (
            <View key={member.id} style={styles.adminRow} testID={`transfer-admin-row-${member.id}`}>
              <Avatar memberId={member.id} name={member.name} size={30} />
              <Text style={styles.memberName}>{member.name}</Text>
              {confirmTransferTo?.id === member.id ? (
                <View style={styles.confirmRow}>
                  <AnimatedPressable
                    onPress={() => handleTransferAdmin(member)}
                    testID={`transfer-admin-confirm-${member.id}`}
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmButtonText}>{t('settings.confirmTransferYes')}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => setConfirmTransferTo(null)}
                    testID={`transfer-admin-cancel-${member.id}`}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>{t('missions.cancel')}</Text>
                  </AnimatedPressable>
                </View>
              ) : (
                <AnimatedPressable
                  onPress={() => setConfirmTransferTo(member)}
                  testID={`transfer-admin-${member.id}`}
                  style={styles.makeAdminButton}
                >
                  <Text style={styles.makeAdminText}>{t('settings.makeAdmin')}</Text>
                </AnimatedPressable>
              )}
            </View>
          ))}

        {/* Handing the house over cannot be undone from this side -- only the
            new admin can hand it back -- so it asks first. */}
        {confirmTransferTo && (
          <Text style={styles.confirmHint} testID="transfer-admin-confirm-hint">
            {t('settings.confirmTransfer', { name: confirmTransferTo.name })}
          </Text>
        )}
        {transferMessage && (
          <Text style={styles.savedText} testID="transfer-admin-done">
            {transferMessage}
          </Text>
        )}
      </Card>

      {!isAdmin && (
        <View style={styles.adminOnlyRow} testID="settings-admin-only">
          <Ionicons name={ICONS.admin} size={18} color={colors.amber} />
          <Text style={styles.adminOnlyText}>{t('settings.adminOnly')}</Text>
        </View>
      )}

      <Card style={styles.block}>
        <Text style={styles.label}>{t('settings.strategyLabel')}</Text>
        <View style={styles.chipRow}>
          {STRATEGIES.map((option) => (
            <AnimatedPressable
              key={option}
              onPress={() => setStrategy(option)}
              disabled={!isAdmin}
              testID={`strategy-${option}`}
              style={[styles.chip, strategy === option && styles.chipActive, !isAdmin && styles.chipDisabled]}
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
              style={[styles.chip, period === option && styles.chipActive, !isAdmin && styles.chipDisabled]}
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
              style={[styles.dayChip, balanceDay === day && styles.chipActive, !isAdmin && styles.chipDisabled]}
            >
              <Text style={[styles.chipText, balanceDay === day && styles.chipTextActive]}>{weekdayName(day, 'short')}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </Card>

      <Card style={styles.block}>
        <Text style={styles.label}>{t('settings.weightsLabel')}</Text>
        <Text style={styles.hint}>{t('settings.weightHint')}</Text>
        {members.map((member) => (
          <View key={member.id} testID={`member-weight-${member.id}`} style={styles.weightRow}>
            <Text style={styles.memberName}>{member.name}</Text>
            <TextInput
              value={weightDrafts[member.id] ?? ''}
              onChangeText={(value) => setWeightDrafts((prev) => ({ ...prev, [member.id]: value }))}
              keyboardType="numeric"
              editable={isAdmin}
              testID={`member-weight-input-${member.id}`}
              style={styles.weightInput}
            />
          </View>
        ))}
      </Card>

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
          <Ionicons name="save-outline" size={20} color={colors.cream} />
          <Text style={styles.saveButtonText}>{t('settings.save')}</Text>
        </AnimatedPressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.md,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockHeaderText: {
    flex: 1,
    gap: 2,
  },
  blockTitle: {
    ...type.subheading,
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
    minHeight: 40,
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
  restartHint: {
    ...type.caption,
    color: colors.amber,
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  adminTag: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: tint(sectionColors.settings, '1F'),
  },
  adminTagText: {
    ...type.caption,
    fontWeight: '800',
    color: sectionColors.settings,
  },
  makeAdminButton: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  makeAdminText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  confirmButton: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: sectionColors.settings,
  },
  confirmButtonText: {
    ...type.caption,
    fontWeight: '800',
    color: colors.surface,
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.textMuted,
  },
  confirmHint: {
    ...type.caption,
    color: colors.amber,
  },
  label: {
    ...type.label,
    color: colors.textMuted,
  },
  hint: {
    ...type.caption,
    color: colors.textMuted,
  },
  adminOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: tint(colors.amber, '1A'),
  },
  adminOnlyText: {
    ...type.caption,
    color: colors.ink,
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayChip: {
    paddingHorizontal: spacing.sm,
    minWidth: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: sectionColors.settings,
    backgroundColor: sectionColors.settings,
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.ink,
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
    ...type.body,
    color: colors.ink,
  },
  weightInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    minHeight: 44,
    width: 80,
    textAlign: 'center',
    backgroundColor: colors.background,
    ...type.body,
    color: colors.ink,
  },
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  savedText: {
    ...type.body,
    color: colors.sage,
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
    marginTop: spacing.sm,
  },
  saveButtonText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
});
