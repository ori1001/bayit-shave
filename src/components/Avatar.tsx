import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorForMember, colors, ICONS } from '../theme';

interface AvatarProps {
  memberId?: string | null;
  name?: string | null;
  size?: number;
  showAdminBadge?: boolean;
  testID?: string;
}

/**
 * A member's colour is derived from their id, so the same person reads the same
 * on Today, the calendar and the balance sheet.
 *
 * Falls back to a neutral person icon when there is no name -- an unassigned
 * mission should look unassigned, not like a member with a blank name.
 */
export function Avatar({ memberId, name, size = 28, showAdminBadge = false, testID }: AvatarProps) {
  const background = colorForMember(memberId);
  const initial = name?.trim()?.[0]?.toUpperCase();

  return (
    <View
      testID={testID}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}
    >
      {initial ? (
        <Text style={[styles.initial, { fontSize: size * 0.44 }]}>{initial}</Text>
      ) : (
        <Ionicons name={ICONS.member} size={size * 0.66} color={colors.surface} />
      )}
      {showAdminBadge && (
        <View style={styles.badge}>
          <Ionicons name={ICONS.admin} size={10} color={colors.surface} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.surface,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    // `end` rather than `right` so the badge sits correctly under RTL too.
    end: -2,
    backgroundColor: colors.ink,
    borderRadius: 8,
    padding: 1,
  },
});
