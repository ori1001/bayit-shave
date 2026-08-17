import { useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resolveSuggestion, type Mission } from '../../features/missions/api';
import { resolveSwap, resolveUnavailability, type SwapRequest, type UnavailabilityRequest } from '../../features/requests/api';
import { fetchInbox, inboxKey, type InboxItem } from '../../features/tabs-data';
import { useScreenData } from '../../lib/screen-data';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { FadeIn } from '../../components/Motion';
import * as haptics from '../../lib/haptics';
import { colors, spacing, radii, type, sectionColors, stateColors, ICONS, tint, type IoniconName } from '../../theme';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' | 'schedule_edit' {
  if (mission.status === 'pending_approval') {
    return 'new_mission';
  }
  if (mission.proposed_points !== null) {
    return 'points_edit';
  }
  return 'schedule_edit';
}

/**
 * A schedule edit can move the day, the assignee, or both, so the summary line
 * has to cover a reassignment-only proposal rather than printing "date -> null".
 */
function scheduleEditDetail(mission: Mission, members: { id: string; name: string }[]): string {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? id ?? '';
  const parts: string[] = [mission.title];
  if (mission.proposed_due_date) {
    parts.push(`${mission.due_date} → ${mission.proposed_due_date}`);
  }
  if (mission.proposed_assigned_to) {
    parts.push(`${nameOf(mission.assigned_to)} → ${nameOf(mission.proposed_assigned_to)}`);
  }
  return parts.join(' · ');
}

const KIND_ICON: Record<'new_mission' | 'points_edit' | 'schedule_edit', IoniconName> = {
  new_mission: 'add-circle-outline',
  points_edit: 'pricetag-outline',
  schedule_edit: 'calendar-outline',
};

function itemId(item: InboxItem): string {
  return item.kind === 'mission' ? item.mission.id : item.kind === 'swap' ? item.swap.id : item.unavailability.id;
}

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const load = useCallback(() => fetchInbox(houseId), [houseId]);

  const { data, fromCache, loading, error, refresh, update } = useScreenData(inboxKey(houseId), load);

  const items = useMemo(() => data?.items ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);
  const isAdmin = data?.isAdmin;

  /**
   * A decision removes the card before the request finishes.
   *
   * Approving used to blank the whole inbox to skeletons and rebuild it, which
   * on a list of five suggestions meant five full page loads to clear it.
   */
  function dismiss(id: string) {
    update((current) => ({ ...current, items: current.items.filter((item) => itemId(item) !== id) }));
  }

  async function handleMissionDecision(mission: Mission, decision: 'approve' | 'reject') {
    haptics.decide();
    dismiss(mission.id);
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await refresh();
  }

  async function handleSwapDecision(swap: SwapRequest, decision: 'approve' | 'reject') {
    haptics.decide();
    dismiss(swap.id);
    await resolveSwap(swap.id, decision);
    await refresh();
  }

  async function handleUnavailabilityDecision(unavailability: UnavailabilityRequest, decision: 'approve' | 'reject') {
    haptics.decide();
    dismiss(unavailability.id);
    await resolveUnavailability(unavailability.id, decision);
    await refresh();
  }

  function decisionRow(onApprove: () => void, onReject: () => void, approveId: string, rejectId: string) {
    return (
      <View style={styles.decisionRow}>
        <AnimatedPressable onPress={onApprove} testID={approveId} style={styles.approveButton}>
          <Ionicons name={ICONS.approve} size={18} color={colors.surface} />
          <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={onReject} testID={rejectId} style={styles.rejectButton}>
          <Ionicons name={ICONS.reject} size={18} color={colors.rose} />
          <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <Screen
      section="inbox"
      title={t('suggestions.title')}
      icon={ICONS.inbox}
      tab="inbox"
      houseId={houseId}
      isAdmin={isAdmin}
      inboxCount={items.length}
      loading={loading}
      error={error}
      onRetry={refresh}
      errorTestID="suggestions-load-error"
    >
      <FlatList
        data={items}
        keyExtractor={itemId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            tone={sectionColors.inbox}
            title={t('suggestions.emptyTitle')}
            body={t('suggestions.emptyBody')}
            testID="suggestions-empty"
          />
        }
        renderItem={({ item, index }) => {
          if (item.kind === 'mission') {
            const kind = suggestionTypeOf(item.mission);
            return (
              <FadeIn index={index} skip={fromCache}>
                <Card
                  testID={`suggestion-${item.mission.id}`}
                  style={[styles.card, { borderStartWidth: 4, borderStartColor: stateColors.proposed }]}
                >
                  <View style={styles.cardHeader}>
                    <CategoryIcon category={item.mission.category} size={20} />
                    <View style={[styles.kindPill, { backgroundColor: tint(stateColors.proposed, '1A') }]}>
                      <Ionicons name={KIND_ICON[kind]} size={13} color={stateColors.proposed} />
                      <Text style={[styles.cardKind, { color: stateColors.proposed }]}>
                        {kind === 'new_mission'
                          ? t('suggestions.newMission')
                          : kind === 'points_edit'
                            ? t('suggestions.pointsEdit')
                            : t('suggestions.scheduleEdit')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardBody}>
                    {kind === 'new_mission'
                      ? `${item.mission.title} · ${item.mission.points}`
                      : kind === 'points_edit'
                        ? `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`
                        : scheduleEditDetail(item.mission, members)}
                  </Text>
                  {decisionRow(
                    () => handleMissionDecision(item.mission, 'approve'),
                    () => handleMissionDecision(item.mission, 'reject'),
                    `approve-${item.mission.id}`,
                    `reject-${item.mission.id}`
                  )}
                </Card>
              </FadeIn>
            );
          }

          if (item.kind === 'swap') {
            return (
              <FadeIn index={index} skip={fromCache}>
                <Card
                  testID={`suggestion-swap-${item.swap.id}`}
                  style={[styles.card, { borderStartWidth: 4, borderStartColor: sectionColors.calendar }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.kindPill, { backgroundColor: tint(sectionColors.calendar, '1A') }]}>
                      <Ionicons name={ICONS.swap} size={13} color={sectionColors.calendar} />
                      <Text style={[styles.cardKind, { color: sectionColors.calendar }]}>{t('suggestions.swap')}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardBody}>
                    {item.swap.mission_instances?.title ?? ''} ·{' '}
                    {members.find((m) => m.id === item.swap.from_member)?.name ?? item.swap.from_member} →{' '}
                    {members.find((m) => m.id === item.swap.to_member)?.name ?? item.swap.to_member}
                  </Text>
                  {decisionRow(
                    () => handleSwapDecision(item.swap, 'approve'),
                    () => handleSwapDecision(item.swap, 'reject'),
                    `approve-swap-${item.swap.id}`,
                    `reject-swap-${item.swap.id}`
                  )}
                </Card>
              </FadeIn>
            );
          }

          return (
            <FadeIn index={index} skip={fromCache}>
              <Card
                testID={`suggestion-unavailability-${item.unavailability.id}`}
                style={[styles.card, { borderStartWidth: 4, borderStartColor: sectionColors.unavailability }]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.kindPill, { backgroundColor: tint(sectionColors.unavailability, '1A') }]}>
                    <Ionicons name={ICONS.unavailability} size={13} color={sectionColors.unavailability} />
                    <Text style={[styles.cardKind, { color: sectionColors.unavailability }]}>
                      {t('suggestions.unavailability')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardBody}>
                  {item.unavailability.period_start} → {item.unavailability.period_end}
                  {item.unavailability.reason ? ` · ${item.unavailability.reason}` : ''}
                </Text>
                {decisionRow(
                  () => handleUnavailabilityDecision(item.unavailability, 'approve'),
                  () => handleUnavailabilityDecision(item.unavailability, 'reject'),
                  `approve-unavailability-${item.unavailability.id}`,
                  `reject-unavailability-${item.unavailability.id}`
                )}
              </Card>
            </FadeIn>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  card: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  cardKind: {
    ...type.caption,
    fontWeight: '800',
  },
  cardBody: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: stateColors.done,
    borderRadius: radii.md,
    minHeight: 46,
  },
  approveButtonText: {
    ...type.label,
    fontWeight: '800',
    color: colors.surface,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.rose,
    borderRadius: radii.md,
    minHeight: 46,
  },
  rejectButtonText: {
    ...type.label,
    fontWeight: '800',
    color: colors.rose,
  },
});
