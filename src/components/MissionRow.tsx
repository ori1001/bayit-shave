import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryIcon } from './CategoryIcon';
import { Avatar } from './Avatar';
import { colors, spacing, radii, type, stateColors, CATEGORY_META, ICONS, tint, wash, type StateKey } from '../theme';

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
  const categoryColor = (CATEGORY_META[category] ?? CATEGORY_META.other).color;
  const isDone = state === 'done';

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        // A leading border reads as a status stripe in both directions, unlike a
        // left border which would land on the wrong edge in Hebrew.
        { borderStartColor: stateColor, borderStartWidth: 4 },
        // The faintest wash of the category's own colour. A list of chores was
        // a stack of identical white boxes; at a few percent each row still
        // reads as white on its own, but the list reads as a palette.
        { backgroundColor: wash(categoryColor), borderColor: tint(categoryColor, '2E') },
        isDone && styles.rowDone,
      ]}
    >
      <CategoryIcon category={category} size={22} />

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

      {assigneeName || assigneeId ? <Avatar memberId={assigneeId} name={assigneeName} size={28} /> : null}

      <View style={[styles.points, { backgroundColor: tint(stateColor, '1F') }]}>
        <Ionicons name={ICONS.points} size={12} color={stateColor} />
        <Text style={[styles.pointsText, { color: stateColor }]}>{points}</Text>
      </View>

      <Ionicons name={ICONS[STATE_ICON[state]]} size={22} color={stateColor} />
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
    // Was spacing.md all round, which put a 16pt title in a 44pt row. A chore
    // row is the app's main tap target and now clears the 60pt a thumb wants.
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 62,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  rowDone: {
    opacity: 0.62,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  detail: {
    ...type.caption,
    color: colors.textMuted,
  },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  pointsText: {
    ...type.caption,
    fontWeight: '800',
  },
});
