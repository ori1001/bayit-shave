import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSuggestions, resolveSuggestion, getHouseMembers, type Mission } from '../../features/missions/api';
import {
  getPendingSwapsForAdmin,
  getPendingUnavailability,
  resolveSwap,
  resolveUnavailability,
  type SwapRequest,
  type UnavailabilityRequest,
} from '../../features/requests/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { colors, spacing, radii, type IoniconName } from '../../theme';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' | 'schedule_edit' {
  if (mission.status === 'pending_approval') {
    return 'new_mission';
  }
  if (mission.proposed_points !== null) {
    return 'points_edit';
  }
  return 'schedule_edit';
}

const KIND_ICON: Record<'new_mission' | 'points_edit' | 'schedule_edit', IoniconName> = {
  new_mission: 'add-circle-outline',
  points_edit: 'pricetag-outline',
  schedule_edit: 'calendar-outline',
};

type InboxItem =
  | { kind: 'mission'; mission: Mission }
  | { kind: 'swap'; swap: SwapRequest }
  | { kind: 'unavailability'; unavailability: UnavailabilityRequest };

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [missions, swaps, unavailability, houseMembers] = await Promise.all([
      getSuggestions(houseId),
      getPendingSwapsForAdmin(houseId),
      getPendingUnavailability(houseId),
      getHouseMembers(houseId),
    ]);
    setMembers(houseMembers);
    setItems([
      ...missions.map((mission): InboxItem => ({ kind: 'mission', mission })),
      ...swaps.map((swap): InboxItem => ({ kind: 'swap', swap })),
      ...unavailability.map((unavailability): InboxItem => ({ kind: 'unavailability', unavailability })),
    ]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleMissionDecision(mission: Mission, decision: 'approve' | 'reject') {
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await load();
  }

  async function handleSwapDecision(swap: SwapRequest, decision: 'approve' | 'reject') {
    await resolveSwap(swap.id, decision);
    await load();
  }

  async function handleUnavailabilityDecision(unavailability: UnavailabilityRequest, decision: 'approve' | 'reject') {
    await resolveUnavailability(unavailability.id, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('suggestions.title')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'mission' ? item.mission.id : item.kind === 'swap' ? item.swap.id : item.unavailability.id)}
        contentContainerStyle={{ gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('suggestions.empty')}</Text>}
        renderItem={({ item }) => {
          if (item.kind === 'mission') {
            const kind = suggestionTypeOf(item.mission);
            return (
              <Card testID={`suggestion-${item.mission.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <CategoryIcon category={item.mission.category} size={18} />
                  <Ionicons name={KIND_ICON[kind]} size={14} color={colors.textMuted} />
                  <Text style={styles.cardKind}>
                    {kind === 'new_mission' ? t('suggestions.newMission') : kind === 'points_edit' ? t('suggestions.pointsEdit') : t('suggestions.scheduleEdit')}
                  </Text>
                </View>
                <Text style={styles.cardBody}>
                  {kind === 'new_mission'
                    ? `${item.mission.title} · ${item.mission.points}`
                    : kind === 'points_edit'
                      ? `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`
                      : `${item.mission.title} · ${item.mission.due_date} → ${item.mission.proposed_due_date}`}
                </Text>
                <View style={styles.decisionRow}>
                  <AnimatedPressable onPress={() => handleMissionDecision(item.mission, 'approve')} testID={`approve-${item.mission.id}`} style={styles.approveButton}>
                    <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => handleMissionDecision(item.mission, 'reject')} testID={`reject-${item.mission.id}`} style={styles.rejectButton}>
                    <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
                  </AnimatedPressable>
                </View>
              </Card>
            );
          }

          if (item.kind === 'swap') {
            return (
              <Card testID={`suggestion-swap-${item.swap.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.indigo} />
                  <Text style={styles.cardKind}>{t('suggestions.swap')}</Text>
                </View>
                <Text style={styles.cardBody}>
                  {item.swap.mission_instances?.title ?? ''} · {members.find((m) => m.id === item.swap.from_member)?.name ?? item.swap.from_member} →{' '}
                  {members.find((m) => m.id === item.swap.to_member)?.name ?? item.swap.to_member}
                </Text>
                <View style={styles.decisionRow}>
                  <AnimatedPressable onPress={() => handleSwapDecision(item.swap, 'approve')} testID={`approve-swap-${item.swap.id}`} style={styles.approveButton}>
                    <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => handleSwapDecision(item.swap, 'reject')} testID={`reject-swap-${item.swap.id}`} style={styles.rejectButton}>
                    <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
                  </AnimatedPressable>
                </View>
              </Card>
            );
          }

          return (
            <Card testID={`suggestion-unavailability-${item.unavailability.id}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="airplane-outline" size={18} color={colors.violet} />
                <Text style={styles.cardKind}>{t('suggestions.unavailability')}</Text>
              </View>
              <Text style={styles.cardBody}>
                {item.unavailability.period_start} → {item.unavailability.period_end}
                {item.unavailability.reason ? ` · ${item.unavailability.reason}` : ''}
              </Text>
              <View style={styles.decisionRow}>
                <AnimatedPressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'approve')}
                  testID={`approve-unavailability-${item.unavailability.id}`}
                  style={styles.approveButton}
                >
                  <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'reject')}
                  testID={`reject-unavailability-${item.unavailability.id}`}
                  style={styles.rejectButton}
                >
                  <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
                </AnimatedPressable>
              </View>
            </Card>
          );
        }}
      />
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
  emptyText: {
    color: colors.textMuted,
  },
  card: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardKind: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  cardBody: {
    fontWeight: '700',
    color: colors.ink,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  approveButton: {
    flex: 1,
    backgroundColor: colors.sage,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  approveButtonText: {
    color: colors.surface,
    fontWeight: '700',
  },
  rejectButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.rose,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: colors.rose,
    fontWeight: '700',
  },
});
