import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryIcon } from './CategoryIcon';
import { Avatar } from './Avatar';
import { colors, spacing, radii, stateColors, ICONS, tint, type StateKey } from '../theme';

export type MissionRowState = StateKey;

interface MissionRowProps {
  title: string;
  category: string;
  points: number;
  state?: MissionRowState;
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Extra line under the title — a date, a proposal, an assignee change. */
  detail?: string | null;
  testID?: string;
}

const STATE_ICON: Record<MissionRowState, keyof typeof ICONS> = {
  done: 'done',
  pending: 'awaiting',
  overdue: 'overdue',
  proposed: 'awaiting',
  open: 'todo',
};

/**
 * The app's core row, shared by Today, the calendar day sheet and the inbox.
 *
 * Carries three signals at a glance: what kind of chore (category colour and
 * icon), whose it is (member colour), and where it stands (state colour and
 * icon). Previously each screen rendered its own arrangement of plain text.
 */
export function MissionRow({
  title,
  category,
  points,
  state = 'open',
  assigneeId,
  assigneeName,
  detail,
  testID,
}: MissionRowProps) {
  const stateColor = stateColors[state];
  const isDone = state === 'done';

  return (
    <View
      testID={testID}
      // A leading border reads as a status stripe in both directions, unlike a
      // left border which would land on the wrong edge in Hebrew.
      style={[styles.row, { borderStartColor: stateColor, borderStartWidth: 3 }, isDone && styles.rowDone]}
    >
      <CategoryIcon category={category} size={20} />

      <View style={styles.body}>
        <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>

      {assigneeName || assigneeId ? <Avatar memberId={assigneeId} name={assigneeName} size={24} /> : null}

      <View style={[styles.points, { backgroundColor: tint(stateColor, '1F') }]}>
        <Ionicons name={ICONS.points} size={11} color={stateColor} />
        <Text style={[styles.pointsText, { color: stateColor }]}>{points}</Text>
      </View>

      <Ionicons name={ICONS[STATE_ICON[state]]} size={18} color={stateColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowDone: {
    opacity: 0.62,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: '700',
    color: colors.ink,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  detail: {
    fontSize: 12,
    color: colors.textMuted,
  },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  pointsText: {
    fontWeight: '800',
    fontSize: 12,
  },
});
