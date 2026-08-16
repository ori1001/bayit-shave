import i18n from '../../i18n';
import { describeRecurrence, weekdayName } from '../recurrence';

describe('describeRecurrence', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('reads a weekly rule as a sentence, not storage syntax', () => {
    expect(describeRecurrence('weekly:fri')).toBe('Every Friday');
    expect(describeRecurrence('weekly:mon')).toBe('Every Monday');
  });

  it('reads a monthly rule with its day', () => {
    expect(describeRecurrence('monthly:15')).toBe('Monthly on day 15');
  });

  it('is case-insensitive, matching the generator', () => {
    expect(describeRecurrence('WEEKLY:FRI')).toBe('Every Friday');
  });

  it('falls back to the raw rule rather than hiding an unknown one', () => {
    // Showing something odd is recoverable; showing nothing loses information.
    expect(describeRecurrence('every-other-tuesday')).toBe('every-other-tuesday');
    expect(describeRecurrence('weekly:funday')).toBe('weekly:funday');
    expect(describeRecurrence('monthly:99')).toBe('monthly:99');
  });

  it('translates the weekday when the language changes', async () => {
    await i18n.changeLanguage('he');
    const hebrew = describeRecurrence('weekly:fri');
    expect(hebrew).not.toBe('Every Friday');
    expect(hebrew).toContain('שישי');
    await i18n.changeLanguage('en');
  });
});

describe('weekdayName', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('maps the stored 0-6 index to a name', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(5)).toBe('Friday');
  });

  it('offers a short form for chips', () => {
    expect(weekdayName(5, 'short')).toBe('Fri');
  });
});
