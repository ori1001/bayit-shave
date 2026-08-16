import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, spacing, radii, sectionColors, ICONS, tint } from '../theme';

export type TabKey = 'today' | 'calendar' | 'balance' | 'inbox' | 'more';

interface TabBarProps {
  active: TabKey;
  houseId: string;
  /** Unread suggestions, shown as a badge on the inbox tab. */
  inboxCount?: number;
  isAdmin?: boolean;
  onMore?: () => void;
}

/**
 * Bottom navigation.
 *
 * Replaces the stack of up to seven identical full-width buttons that used to
 * sit under the mission list on Today. Each destination keeps its own colour so
 * the current section is legible without reading the label.
 *
 * Deliberately not expo-router's Tabs: that would require moving every screen
 * into a route group, changing every path, and breaking the testIDs the three
 * test suites rely on. This navigates the existing routes.
 */
export function TabBar({ active, houseId, inboxCount = 0, isAdmin = false, onMore }: TabBarProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const tabs: { key: TabKey; icon: keyof typeof ICONS; label: string; go: () => void }[] = [
    {
      key: 'today',
      icon: 'today',
      label: t('tabs.today'),
      go: () => router.replace({ pathname: '/today', params: { houseId } }),
    },
    {
      key: 'calendar',
      icon: 'calendar',
      label: t('tabs.calendar'),
      go: () => router.push({ pathname: '/calendar', params: { houseId } }),
    },
    {
      key: 'balance',
      icon: 'balance',
      label: t('tabs.balance'),
      go: () => router.push({ pathname: '/balance', params: { houseId } }),
    },
  ];

  if (isAdmin) {
    tabs.push({
      key: 'inbox',
      icon: 'inbox',
      label: t('tabs.inbox'),
      go: () => router.push({ pathname: '/missions/suggestions', params: { houseId } }),
    });
  }

  tabs.push({ key: 'more', icon: 'more', label: t('tabs.more'), go: () => onMore?.() });

  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const hue = tab.key === 'more' ? colors.textMuted : sectionColors[tab.key as keyof typeof sectionColors];
        const color = isActive ? hue : colors.textMuted;

        return (
          <AnimatedPressable
            key={tab.key}
            onPress={tab.go}
            testID={`tab-${tab.key}`}
            accessibilityLabel={tab.label}
            style={[styles.tab, isActive && { backgroundColor: tint(hue, '1A') }]}
          >
            <View>
              <Ionicons name={ICONS[tab.icon]} size={20} color={color} />
              {tab.key === 'inbox' && inboxCount > 0 && (
                <View style={styles.badge} testID="tab-inbox-badge">
                  <Text style={styles.badgeText}>{inboxCount > 9 ? '9+' : inboxCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }, isActive && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  label: {
    fontSize: 10,
  },
  labelActive: {
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -5,
    end: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 9,
    fontWeight: '800',
  },
});
