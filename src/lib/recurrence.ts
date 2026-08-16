import i18n from '../i18n';

/**
 * Turns a stored recurrence rule into something a person would say.
 *
 * The rule format (`weekly:fri`, `monthly:15`) is a storage detail that was
 * being rendered straight onto the screen. Nobody reads "weekly:fri" as
 * "every Friday".
 *
 * Unknown rules fall back to the raw string rather than throwing or hiding it:
 * showing something odd is recoverable, showing nothing loses information the
 * user needs.
 */
export function describeRecurrence(rule: string): string {
  const locale = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';
  const [kind, rawArg] = String(rule).toLowerCase().split(':');
  const arg = (rawArg ?? '').trim();

  if (kind === 'weekly') {
    const index = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(arg);
    if (index >= 0) {
      // A known Sunday, stepped to the target weekday, so the name comes from
      // the platform rather than a hand-maintained translation table.
      const dayName = new Date(2026, 1, 1 + index).toLocaleDateString(locale, { weekday: 'long' });
      return i18n.t('templates.everyWeekday', { day: dayName });
    }
  }

  if (kind === 'monthly') {
    const day = Number(arg);
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      return i18n.t('templates.everyMonthDay', { day });
    }
  }

  return rule;
}

/** Weekday name for a stored 0-6 index, in the active language. */
export function weekdayName(index: number, style: 'long' | 'short' = 'long'): string {
  const locale = i18n.language?.startsWith('he') ? 'he-IL' : 'en-US';
  return new Date(2026, 1, 1 + index).toLocaleDateString(locale, { weekday: style });
}
