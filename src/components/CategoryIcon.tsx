import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_META } from '../theme';

interface CategoryIconProps {
  category: string;
  size?: number;
  testID?: string;
}

export function CategoryIcon({ category, size = 22, testID }: CategoryIconProps) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  const badgeSize = size + 14;
  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        // 0x22 alpha washed the badge out almost to the page background; 0x33
        // keeps it a tint rather than a block of colour but stays legible.
        { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, backgroundColor: `${meta.color}33` },
      ]}
    >
      <Ionicons name={meta.icon} size={size * 0.64} color={meta.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
