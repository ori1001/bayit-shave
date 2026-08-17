import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { BottomSheet } from './BottomSheet';
import { MonthGrid, localeOf } from './MonthGrid';
import { toISODate, fromISODate, orderRange, addMonths } from '../lib/dates';
import { colors, spacing, radii, type, sectionColors, ICONS } from '../theme';

function formatLong(iso: string, language: string): string {
  const date = fromISODate(iso);
  if (!date) return '';
  return date.toLocaleDateString(localeOf(language), { day: 'numeric', month: 'long', year: 'numeric' });
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
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const initial = fromISODate(value) ?? new Date();
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() + 1 });

  return (
    <>
      <AnimatedPressable onPress={() => setOpen(true)} testID={testID} style={styles.field}>
        <Ionicons name={ICONS.calendar} size={20} color={sectionColors.calendar} />
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
    start && end ? `${formatLong(start, i18n.language)} – ${formatLong(end, i18n.language)}` : label;

  return (
    <>
      <AnimatedPressable onPress={() => setOpen(true)} testID={testID} style={styles.field}>
        <Ionicons name={ICONS.unavailability} size={20} color={sectionColors.unavailability} />
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
          tone={sectionColors.unavailability}
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
    paddingHorizontal: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  fieldText: {
    ...type.body,
    color: colors.ink,
    flex: 1,
  },
  fieldPlaceholder: {
    color: colors.textMuted,
  },
});
