import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, type, tint, type IoniconName } from '../theme';

interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  /** The line under the title: what to do about it, not a restatement. */
  body?: string;
  /** Section hue, so an empty calendar still reads as the calendar. */
  tone?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * What a screen shows when it has nothing to show.
 *
 * Every list previously fell back to one line of grey text on a blank
 * background, which is indistinguishable from a screen that failed to load. A
 * large tinted glyph fills the space and says the emptiness is the answer, not
 * an error.
 */
export function EmptyState({ icon, title, body, tone = colors.sage, action, style, testID }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <View style={[styles.halo, { backgroundColor: tint(tone, '14') }]}>
        <View style={[styles.disc, { backgroundColor: tint(tone, '1F') }]}>
          <Ionicons name={icon} size={40} color={tone} />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // flexGrow, not just alignItems: as a FlatList's ListEmptyComponent this is
    // a child of the content container, so without it the block sits pinned to
    // the top of an otherwise empty screen instead of in the middle of it.
    // Every list that uses one sets flexGrow on its content container too.
    flexGrow: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  halo: {
    width: 128,
    height: 128,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  disc: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...type.subheading,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  action: {
    marginTop: spacing.md,
  },
});
