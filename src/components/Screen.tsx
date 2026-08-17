import { useState, type ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TabBar, type TabKey } from './TabBar';
import { MoreSheet } from './MoreSheet';
import { LoadErrorView } from './LoadErrorView';
import { peekIsAdmin } from '../features/auth/session';
import { Skeleton } from './Motion';
import { colors, spacing, radii, type, sectionColors, tint, type SectionKey, type IoniconName } from '../theme';

/** Phones are the target, but a stray tablet or the web build should not stretch a form to 900pt. */
const CONTENT_MAX_WIDTH = 560;

interface ScreenProps {
  children: ReactNode;
  /** Drives the header hue and the header icon's wash. */
  section?: SectionKey;
  title?: string;
  icon?: IoniconName;
  subtitle?: string;
  /** Rendered at the far end of the header row — a filter, a count, an action. */
  headerRight?: ReactNode;
  /** Which bottom tab to light up. Omit entirely to hide the bar (auth, onboarding). */
  tab?: TabKey;
  houseId?: string;
  /**
   * Undefined while a screen is still loading, which is deliberate: the bar
   * falls back to what the session already knows rather than assuming false and
   * dropping the admin's inbox tab for a moment.
   */
  isAdmin?: boolean;
  inboxCount?: number;
  /** Wrap the content in a ScrollView. Screens owning their own FlatList leave this off. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** Show placeholder rows in place of the content. Chrome stays put. */
  loading?: boolean;
  /** Show a retry panel in place of the content. Chrome stays put. */
  error?: string | null;
  onRetry?: () => void;
  errorTestID?: string;
}

/**
 * The frame every in-app screen sits in.
 *
 * It exists because three things were being got wrong once per screen: the tab
 * bar was only ever rendered on Today, so navigating anywhere else stranded the
 * user with no way back except the system gesture; nothing accounted for the
 * status bar, so titles sat under the notch; and every screen invented its own
 * header spacing. All three are now decided in one place.
 */
export function Screen({
  children,
  section,
  title,
  icon,
  subtitle,
  headerRight,
  tab,
  houseId = '',
  isAdmin,
  inboxCount = 0,
  scroll = false,
  contentStyle,
  testID,
  loading = false,
  error = null,
  onRetry,
  errorTestID = 'load-error',
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const hue = section ? sectionColors[section] : colors.ink;
  // Every tab is flex-sized, so adding or removing one resizes all of them.
  // Falling back to the session's cached answer keeps the tab set -- and so the
  // bar's whole layout -- identical from the first frame of every screen.
  const admin = isAdmin ?? peekIsAdmin(houseId) ?? false;

  const header = title ? (
    <View style={styles.header}>
      {icon ? (
        <View style={[styles.headerIcon, { backgroundColor: tint(hue, '1F') }]}>
          <Ionicons name={icon} size={22} color={hue} />
        </View>
      ) : null}
      <View style={styles.headerText}>
        {/* Two lines, not one: "Request time off" and its Hebrew equivalent both
            truncate to "Request time ..." at this size on a 390pt phone. */}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {headerRight}
    </View>
  ) : null;

  // Loading and error replace the *content*, never the frame. Returning a
  // bare <LoadingScreen/> or <LoadErrorView/> from a screen is what made the
  // tab bar vanish for the length of every load and for the whole of an error:
  // exactly the moments when the way out matters most.
  let body: ReactNode;
  if (error !== null) {
    body = (
      <View style={[styles.flex, styles.body]}>
        <LoadErrorView message={error} onRetry={onRetry ?? (() => {})} testID={errorTestID} />
      </View>
    );
  } else if (loading) {
    body = (
      <View style={[styles.flex, styles.body]} testID="screen-loading">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={72} />
        ))}
      </View>
    );
  } else if (scroll) {
    body = (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollBody, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  } else {
    body = <View style={[styles.flex, styles.body, contentStyle]}>{children}</View>;
  }

  return (
    <View style={styles.screen} testID={testID}>
      {/* A band of the section colour behind the header, fading into the page.
          It is what tells you which area you are in before you read the title.
          A real gradient rather than a flat block: a hard edge partway down the
          screen reads as a stray view, a fade reads as the page's own light. */}
      <View
        style={[
          styles.wash,
          {
            height: insets.top + 168,
            // No backgroundColor behind it: a flat fill would still be there
            // where the gradient has faded out, which puts a hard horizontal
            // edge across the page exactly where the fade was meant to end.
            experimental_backgroundImage: `linear-gradient(180deg, ${tint(hue, '2E')}, ${tint(hue, '00')})`,
          },
        ]}
        pointerEvents="none"
      />

      <View style={[styles.inner, { paddingTop: insets.top + spacing.md }]}>
        {header}
        {body}
      </View>

      {tab ? (
        <TabBar
          active={tab}
          houseId={houseId}
          isAdmin={admin}
          inboxCount={inboxCount}
          onMore={() => setMoreOpen(true)}
        />
      ) : (
        <View style={{ height: insets.bottom }} />
      )}

      <MoreSheet visible={moreOpen} onClose={() => setMoreOpen(false)} houseId={houseId} isAdmin={admin} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  wash: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.title,
    color: colors.ink,
  },
  subtitle: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  scrollBody: {
    // flexGrow so a scrolling screen whose only content is an empty state
    // centres it in the viewport rather than parking it under the header.
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
});
