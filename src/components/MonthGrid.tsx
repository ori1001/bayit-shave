import { useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Localization from 'expo-localization';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { monthCells, weekdayOrder, isSameDay, isBetween } from '../lib/dates';
import { colors, spacing, radii, type, sectionColors, tint, chevronNext, chevronPrev } from '../theme';

export function localeOf(language: string): string {
  return language?.startsWith('he') ? 'he-IL' : 'en-US';
}

/**
 * Which weekday the device starts its week on, as a 0-based getDay() index.
 *
 * Read once at module load. Both locales the app ships with start on Sunday, so
 * a wrong answer here is invisible in testing but wrong for anyone whose region
 * starts on Monday.
 */
function deviceWeekStart(): number {
  try {
    // The Weekday enum is 1-based with Sunday = 1.
    const first = Localization.getCalendars()[0]?.firstWeekday;
    return typeof first === 'number' ? (first - 1) % 7 : 0;
  } catch {
    return 0;
  }
}

const WEEK_START = deviceWeekStart();

interface MonthGridProps {
  year: number;
  month: number;
  onMonth: (delta: number) => void;
  onPick: (date: Date) => void;
  selected?: Date | null;
  /** Set to draw a range between `selected` and this date. */
  rangeEnd?: Date | null;
  /** Anything drawn under the day number — the mission dots on the calendar. */
  renderDay?: (date: Date, day: number) => ReactNode;
  /** Full-screen calendar cells are taller than a picker sheet's. */
  variant?: 'compact' | 'roomy';
  tone?: string;
  testID: string;
}

/**
 * A month, as an actual seven-column grid.
 *
 * Shared by the calendar screen and both date fields so there is one answer to
 * where the 1st sits, what the week starts on and how a selected day looks.
 */
export function MonthGrid({
  year,
  month,
  onMonth,
  onPick,
  selected,
  rangeEnd,
  renderDay,
  variant = 'compact',
  tone = sectionColors.calendar,
  testID,
}: MonthGridProps) {
  const { i18n } = useTranslation();
  const locale = localeOf(i18n.language);
  const roomy = variant === 'roomy';

  const cells = useMemo(() => monthCells(year, month, WEEK_START), [year, month]);

  const weekdays = useMemo(
    () =>
      weekdayOrder(WEEK_START).map((index) =>
        // 2026-02-01 is a Sunday, so adding the index lands on that weekday.
        new Date(2026, 1, 1 + index).toLocaleDateString(locale, { weekday: roomy ? 'short' : 'narrow' })
      ),
    [locale, roomy]
  );

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const today = new Date();

  return (
    <View testID={testID}>
      <View style={styles.navRow}>
        <AnimatedPressable onPress={() => onMonth(-1)} testID={`${testID}-prev`} style={styles.navBtn}>
          <Ionicons name={chevronPrev()} size={22} color={tone} />
        </AnimatedPressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <AnimatedPressable onPress={() => onMonth(1)} testID={`${testID}-next`} style={styles.navBtn}>
          <Ionicons name={chevronNext()} size={22} color={tone} />
        </AnimatedPressable>
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((label, i) => (
          <Text key={i} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`pad-${index}`} style={[styles.cell, roomy && styles.cellRoomy]} />;
          }

          const date = new Date(year, month - 1, day);
          const isStart = isSameDay(date, selected ?? null);
          const isEnd = isSameDay(date, rangeEnd ?? null);
          const inRange = isBetween(date, selected ?? null, rangeEnd ?? null);
          const isToday = isSameDay(date, today);
          const isPicked = isStart || isEnd;

          return (
            <AnimatedPressable
              key={day}
              onPress={() => onPick(date)}
              testID={`${testID}-day-${day}`}
              accessibilityState={{ selected: isPicked }}
              style={[styles.cell, roomy && styles.cellRoomy]}
            >
              <View
                style={[
                  styles.pad,
                  inRange && { backgroundColor: tint(tone, '1A') },
                  // Today is a ring, a picked day is a fill. Using the same
                  // treatment for both made "today" look permanently selected.
                  isToday && !isPicked && { borderWidth: 1.5, borderColor: tone },
                  isPicked && { backgroundColor: tone },
                ]}
              >
                <Text style={[styles.cellText, isToday && !isPicked && { color: tone }, isPicked && styles.cellTextPicked]}>
                  {day}
                </Text>
                {renderDay?.(date, day)}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  monthLabel: {
    ...type.subheading,
    color: colors.ink,
  },
  weekRow: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    ...type.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 2,
  },
  cellRoomy: {
    aspectRatio: 0.86,
  },
  pad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    gap: 3,
  },
  cellText: {
    ...type.label,
    color: colors.ink,
  },
  cellTextPicked: {
    color: colors.surface,
    fontWeight: '800',
  },
});
