import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { BottomSheet } from './BottomSheet';
import {
  toISODate,
  fromISODate,
  daysInMonth,
  firstWeekdayOfMonth,
  isSameDay,
  isBetween,
  orderRange,
  addMonths,
} from '../lib/dates';
import { colors, spacing, radii, sectionColors, ICONS, tint, chevronNext, chevronPrev } from '../theme';

function localeOf(language: string): string {
  return language?.startsWith('he') ? 'he-IL' : 'en-US';
}

function formatLong(iso: string, language: string): string {
  const date = fromISODate(iso);
  if (!date) return '';
  return date.toLocaleDateString(localeOf(language), { day: 'numeric', month: 'long', year: 'numeric' });
}

interface GridProps {
  year: number;
  month: number;
  onMonth: (delta: number) => void;
  selected: Date | null;
  rangeEnd?: Date | null;
  onPick: (date: Date) => void;
  testID: string;
}

/** The shared month grid. Used by both the single and range fields. */
function MonthGrid({ year, month, onMonth, selected, rangeEnd, onPick, testID }: GridProps) {
  const { i18n } = useTranslation();
  const locale = localeOf(i18n.language);

  const total = daysInMonth(year, month);
  const lead = firstWeekdayOfMonth(year, month);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  // Weekday initials in the active language, starting Sunday to match getDay().
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 1, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })
  );

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <View testID={testID}>
      <View style={styles.navRow}>
        <AnimatedPressable onPress={() => onMonth(-1)} testID={`${testID}-prev`} style={styles.navBtn}>
          <Ionicons name={chevronPrev()} size={20} color={sectionColors.calendar} />
        </AnimatedPressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <AnimatedPressable onPress={() => onMonth(1)} testID={`${testID}-next`} style={styles.navBtn}>
          <Ionicons name={chevronNext()} size={20} color={sectionColors.calendar} />
        </AnimatedPressable>
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((day, i) => (
          <Text key={i} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`pad-${index}`} style={styles.cell} />;
          }
          const date = new Date(year, month - 1, day);
          const isStart = isSameDay(date, selected);
          const isEnd = isSameDay(date, rangeEnd ?? null);
          const inRange = isBetween(date, selected, rangeEnd ?? null);

          return (
            <AnimatedPressable
              key={day}
              onPress={() => onPick(date)}
              testID={`${testID}-day-${day}`}
              style={[styles.cell, inRange && styles.cellInRange, (isStart || isEnd) && styles.cellSelected]}
            >
              <Text style={[styles.cellText, (isStart || isEnd) && styles.cellTextSelected]}>{day}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

interface DateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  label: string;
  testID: string;
}

/**
 * A single date, chosen from a grid.
 *
 * The value can only ever come from tapping a day, so a malformed or impossible
 * date cannot be entered -- which removes the errors typing YYYY-MM-DD produced
 * rather than validating them after the fact.
 */
export function DateField({ value, onChange, label, testID }: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const initial = fromISODate(value) ?? new Date();
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() + 1 });

  return (
    <>
      <AnimatedPressable onPress={() => setOpen(true)} testID={testID} style={styles.field}>
        <Ionicons name={ICONS.calendar} size={18} color={sectionColors.calendar} />
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]}>
          {value ? formatLong(value, i18n.language) : label}
        </Text>
      </AnimatedPressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label} testID={`${testID}-sheet`}>
        <MonthGrid
          year={view.year}
          month={view.month}
          onMonth={(delta) => setView(addMonths(view.year, view.month, delta))}
          selected={fromISODate(value)}
          onPick={(date) => {
            onChange(toISODate(date));
            setOpen(false);
          }}
          testID={`${testID}-grid`}
        />
      </BottomSheet>
    </>
  );
}

interface DateRangeFieldProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  label: string;
  testID: string;
}

/**
 * A start and an end, picked from one grid.
 *
 * The first tap sets the start, the second the end. A second tap earlier than
 * the first restarts the selection rather than being rejected -- picking
 * backwards is intent, not an error.
 */
export function DateRangeField({ start, end, onChange, label, testID }: DateRangeFieldProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const initial = fromISODate(start) ?? new Date();
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() + 1 });

  const startDate = pendingStart ?? fromISODate(start);
  const endDate = pendingStart ? null : fromISODate(end);

  function handlePick(date: Date) {
    if (!pendingStart) {
      setPendingStart(date);
      return;
    }
    const [from, to] = orderRange(pendingStart, date);
    onChange(toISODate(from), toISODate(to));
    setPendingStart(null);
    setOpen(false);
  }

  const summary =
    start && end
      ? `${formatLong(start, i18n.language)} – ${formatLong(end, i18n.language)}`
      : label;

  return (
    <>
      <AnimatedPressable onPress={() => setOpen(true)} testID={testID} style={styles.field}>
        <Ionicons name={ICONS.unavailability} size={18} color={sectionColors.unavailability} />
        <Text style={[styles.fieldText, !(start && end) && styles.fieldPlaceholder]}>{summary}</Text>
      </AnimatedPressable>

      <BottomSheet
        visible={open}
        onClose={() => {
          setPendingStart(null);
          setOpen(false);
        }}
        title={label}
        testID={`${testID}-sheet`}
      >
        <MonthGrid
          year={view.year}
          month={view.month}
          onMonth={(delta) => setView(addMonths(view.year, view.month, delta))}
          selected={startDate}
          rangeEnd={endDate}
          onPick={handlePick}
          testID={`${testID}-grid`}
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  fieldText: {
    color: colors.ink,
    flex: 1,
  },
  fieldPlaceholder: {
    color: colors.textMuted,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navBtn: {
    padding: spacing.sm,
  },
  monthLabel: {
    fontWeight: '800',
    color: colors.ink,
    fontSize: 15,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  cellInRange: {
    backgroundColor: tint(sectionColors.calendar, '1A'),
  },
  cellSelected: {
    backgroundColor: sectionColors.calendar,
  },
  cellText: {
    color: colors.ink,
    fontSize: 13,
  },
  cellTextSelected: {
    color: colors.surface,
    fontWeight: '800',
  },
});
