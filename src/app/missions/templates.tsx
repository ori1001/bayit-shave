import { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type MissionCategory } from '../../features/missions/api';
import { createTemplate, deleteTemplate, generateRecurringMissions } from '../../features/templates/api';
import { fetchTemplates, templatesKey } from '../../features/tabs-data';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { EmptyState } from '../../components/EmptyState';
import { useScreenData } from '../../lib/screen-data';
import { describeRecurrence, weekdayName } from '../../lib/recurrence';
import { BottomSheet } from '../../components/BottomSheet';
import { Screen } from '../../components/Screen';
import { FadeIn } from '../../components/Motion';
import { colors, spacing, radii, type, sectionColors, ICONS, MISSION_CATEGORIES, CATEGORY_META, tint } from '../../theme';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;



export default function TemplatesScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [formError, setFormError] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('10');
  const [category, setCategory] = useState<MissionCategory>('dishes');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [weekday, setWeekday] = useState<(typeof WEEKDAYS)[number]>('fri');
  const [monthDay, setMonthDay] = useState('1');
  // Empty means no restriction, which is what the column's NULL means too.
  const [eligible, setEligible] = useState<string[]>([]);

  const load = useCallback(() => fetchTemplates(houseId), [houseId]);

  const { data, fromCache, loading, error, refresh, update } = useScreenData(templatesKey(houseId), load);

  const templates = useMemo(() => data?.templates ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);
  const isAdmin = data?.isAdmin;

  async function handleAdd() {
    setFormError(null);
    setBusy(true);
    try {
      await createTemplate({
        house_id: houseId,
        title,
        category,
        points: Number(points),
        recurrence_rule: frequency === 'weekly' ? `weekly:${weekday}` : `monthly:${Number(monthDay)}`,
        // Null, not an empty array: the balance run reads null as "anyone in
        // the house", and an empty array would read the same but says less.
        eligible_members: eligible.length > 0 ? eligible : null,
      });
      setTitle('');
      setEligible([]);
      setFormOpen(false);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(templateId: string) {
    setFormError(null);
    // Gone from the list on tap; the request only confirms it.
    update((current) => ({ ...current, templates: current.templates.filter((tpl) => tpl.id !== templateId) }));
    try {
      await deleteTemplate(houseId, templateId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : null);
    }
    await refresh();
  }

  async function handleGenerate() {
    setFormError(null);
    setGeneratedCount(null);
    setBusy(true);
    try {
      const { created } = await generateRecurringMissions(houseId);
      setGeneratedCount(created);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      section="templates"
      title={t('templates.title')}
      icon={ICONS.templates}
      tab="more"
      houseId={houseId}
      isAdmin={isAdmin}
      scroll
      loading={loading}
      error={error}
      onRetry={refresh}
      errorTestID="templates-load-error"
    >
      {!isAdmin && (
        <View style={styles.adminOnlyRow} testID="templates-admin-only">
          <Ionicons name={ICONS.admin} size={18} color={colors.amber} />
          <Text style={styles.adminOnlyText}>{t('templates.adminOnly')}</Text>
        </View>
      )}

      {templates.length === 0 ? (
        <EmptyState
          icon={ICONS.templates}
          tone={sectionColors.templates}
          title={t('templates.emptyTitle')}
          body={t('templates.emptyBody')}
          testID="templates-empty"
        />
      ) : (
        templates.map((template, index) => {
          const meta = CATEGORY_META[template.category] ?? CATEGORY_META.other;
          return (
            <FadeIn key={template.id} index={index} skip={fromCache}>
              <Card
                testID={`template-${template.id}`}
                style={[styles.templateCard, { borderStartWidth: 4, borderStartColor: meta.color }]}
              >
                <CategoryIcon category={template.category} size={22} />
                <View style={styles.templateBody}>
                  <Text style={styles.templateTitle}>{template.title}</Text>
                  <Text style={styles.templateMeta}>
                    {describeRecurrence(template.recurrence_rule)} · {template.points}
                  </Text>
                  {template.eligible_members && template.eligible_members.length > 0 && (
                    <Text style={styles.templateMeta} testID={`template-eligible-${template.id}`}>
                      {t('templates.eligibleSummary', {
                        names: template.eligible_members
                          .map((id) => members.find((m) => m.id === id)?.name ?? '')
                          .filter(Boolean)
                          .join(', '),
                      })}
                    </Text>
                  )}
                </View>
                {isAdmin && (
                  <AnimatedPressable
                    onPress={() => handleRemove(template.id)}
                    testID={`template-remove-${template.id}`}
                    accessibilityLabel={t('templates.remove')}
                    style={styles.removeButton}
                  >
                    <Ionicons name={ICONS.remove} size={20} color={colors.rose} />
                  </AnimatedPressable>
                )}
              </Card>
            </FadeIn>
          );
        })
      )}

      {generatedCount !== null && (
        <Text testID="templates-generated" style={styles.generatedText}>
          {generatedCount > 0 ? t('templates.generated', { count: generatedCount }) : t('templates.generatedNone')}
        </Text>
      )}
      {formError && (
        <Text testID="templates-error" style={styles.errorText}>
          {formError}
        </Text>
      )}

      {isAdmin && (
        <>
          <AnimatedPressable onPress={() => setFormOpen(true)} testID="template-open-form" style={styles.primaryButton}>
            <Ionicons name={ICONS.add} size={20} color={colors.cream} />
            <Text style={styles.primaryButtonText}>{t('templates.addTitle')}</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleGenerate}
            disabled={busy || templates.length === 0}
            testID="templates-generate"
            style={[styles.secondaryButton, (busy || templates.length === 0) && styles.buttonDisabled]}
          >
            <Ionicons name={ICONS.calendar} size={20} color={colors.ink} />
            <Text style={styles.secondaryButtonText}>{t('templates.generate')}</Text>
          </AnimatedPressable>

          <BottomSheet
            visible={formOpen}
            onClose={() => setFormOpen(false)}
            title={t('templates.addTitle')}
            testID="template-form-sheet"
          >
            <Text style={styles.label}>{t('templates.titleLabel')}</Text>
            <TextInput value={title} onChangeText={setTitle} testID="template-title-input" style={styles.input} />

            <Text style={styles.label}>{t('templates.pointsLabel')}</Text>
            <TextInput
              value={points}
              onChangeText={setPoints}
              keyboardType="numeric"
              testID="template-points-input"
              style={styles.input}
            />

            <Text style={styles.label}>{t('templates.categoryLabel')}</Text>
            <View style={styles.chipRow}>
              {MISSION_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const active = category === cat;
                return (
                  <AnimatedPressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    testID={`template-category-${cat}`}
                    style={[
                      styles.chip,
                      { borderColor: active ? meta.color : colors.border },
                      active && { backgroundColor: tint(meta.color, '1F') },
                    ]}
                  >
                    <CategoryIcon category={cat} size={16} />
                    <Text style={[styles.chipText, active && { color: meta.color, fontWeight: '800' }]}>
                      {t(`missions.categories.${cat}`)}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <Text style={styles.label}>{t('templates.recurrenceLabel')}</Text>
            <View style={styles.segment}>
              {(['weekly', 'monthly'] as const).map((option) => (
                <AnimatedPressable
                  key={option}
                  onPress={() => setFrequency(option)}
                  testID={`template-frequency-${option}`}
                  style={[styles.segmentOption, frequency === option && styles.segmentOptionActive]}
                >
                  <Text style={[styles.segmentText, frequency === option && styles.segmentTextActive]}>
                    {t(`templates.${option}`)}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>

            {frequency === 'weekly' ? (
              <View style={styles.chipRow}>
                {WEEKDAYS.map((day, index) => (
                  <AnimatedPressable
                    key={day}
                    onPress={() => setWeekday(day)}
                    testID={`template-weekday-${day}`}
                    style={[styles.dayChip, weekday === day && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, weekday === day && styles.chipTextActive]}>
                      {weekdayName(index, 'short')}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            ) : (
              <TextInput
                value={monthDay}
                onChangeText={setMonthDay}
                keyboardType="numeric"
                testID="template-month-day-input"
                style={styles.input}
              />
            )}

            <Text style={styles.label}>{t('templates.eligibleLabel')}</Text>
            <Text style={styles.hint}>{t('templates.eligibleHint')}</Text>
            <View style={styles.chipRow}>
              <AnimatedPressable
                onPress={() => setEligible([])}
                testID="template-eligible-everyone"
                accessibilityState={{ selected: eligible.length === 0 }}
                style={[styles.chip, eligible.length === 0 && styles.chipActive]}
              >
                <Text style={[styles.chipText, eligible.length === 0 && styles.chipTextActive]}>
                  {t('templates.eligibleEveryone')}
                </Text>
              </AnimatedPressable>
              {members.map((m) => {
                const picked = eligible.includes(m.id);
                return (
                  <AnimatedPressable
                    key={m.id}
                    onPress={() =>
                      setEligible((current) =>
                        current.includes(m.id) ? current.filter((id) => id !== m.id) : [...current, m.id]
                      )
                    }
                    testID={`template-eligible-${m.id}`}
                    accessibilityState={{ selected: picked }}
                    style={[styles.chip, picked && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, picked && styles.chipTextActive]}>{m.name}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            {formError && (
              <Text testID="templates-form-error" style={styles.errorText}>
                {formError}
              </Text>
            )}

            <AnimatedPressable
              onPress={handleAdd}
              disabled={busy || !title || !points}
              testID="template-add"
              style={[styles.primaryButton, (busy || !title || !points) && styles.buttonDisabled]}
            >
              <Ionicons name={ICONS.add} size={20} color={colors.cream} />
              <Text style={styles.primaryButtonText}>{t('templates.add')}</Text>
            </AnimatedPressable>
          </BottomSheet>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.label,
    color: colors.textMuted,
  },
  hint: {
    ...type.caption,
    color: colors.textMuted,
  },
  adminOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: tint(colors.amber, '1A'),
  },
  adminOnlyText: {
    ...type.caption,
    color: colors.ink,
    flex: 1,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  templateBody: {
    flex: 1,
    gap: 2,
  },
  templateTitle: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  templateMeta: {
    ...type.caption,
    color: colors.textMuted,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
    ...type.body,
    color: colors.ink,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayChip: {
    paddingHorizontal: spacing.sm,
    minWidth: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: sectionColors.templates,
    backgroundColor: sectionColors.templates,
  },
  chipText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  chipTextActive: {
    color: colors.cream,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    padding: 3,
  },
  segmentOption: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  segmentOptionActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    ...type.label,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.ink,
    fontWeight: '800',
  },
  errorText: {
    ...type.body,
    color: colors.rose,
  },
  generatedText: {
    ...type.body,
    color: colors.sage,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
  },
  primaryButtonText: {
    ...type.bodyStrong,
    color: colors.cream,
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.lg,
    minHeight: 52,
  },
  secondaryButtonText: {
    ...type.bodyStrong,
    color: colors.ink,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
