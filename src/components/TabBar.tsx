import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, spacing, radii, type, sectionColors, ICONS, tint } from '../theme';

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
  const insets = useSafeAreaInsets();

  // navigate, not push: it unwinds to a route already on the stack instead of
  // stacking a second copy, so Today -> Calendar -> Today leaves one of each
  // rather than three screens deep. push made the back gesture replay the whole
  // tour of everywhere you had been.
  const go = (pathname: '/today' | '/calendar' | '/balance' | '/missions/suggestions') => () =>
    router.navigate({ pathname, params: { houseId } });

  const tabs: { key: TabKey; icon: keyof typeof ICONS; label: string; go: () => void }[] = [
    { key: 'today', icon: 'today', label: t('tabs.today'), go: go('/today') },
    { key: 'calendar', icon: 'calendar', label: t('tabs.calendar'), go: go('/calendar') },
    { key: 'balance', icon: 'balance', label: t('tabs.balance'), go: go('/balance') },
  ];

  if (isAdmin) {
    tabs.push({ key: 'inbox', icon: 'inbox', label: t('tabs.inbox'), go: go('/missions/suggestions') });
  }

  tabs.push({ key: 'more', icon: 'more', label: t('tabs.more'), go: () => onMore?.() });

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
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
            accessibilityState={{ selected: isActive }}
            style={styles.tab}
          >
            <View style={[styles.iconPill, isActive && { backgroundColor: tint(hue, '1F') }]}>
              <Ionicons name={ICONS[tab.icon]} size={22} color={color} />
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
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  // The pill, not the whole column, carries the active wash: a 4pt-tall strip of
  // colour behind the label read as a highlight bug at a glance.
  iconPill: {
    minWidth: 56,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...type.caption,
  },
  labelActive: {
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -2,
    end: 8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.surface,
    // The one place below the type scale's 13pt floor: this is a two-character
    // count inside a 17pt disc, not text anyone reads as a sentence.
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
});
