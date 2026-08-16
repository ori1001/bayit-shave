import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyMembership, type MissionCategory } from '../../features/missions/api';
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  generateRecurringMissions,
  type MissionTemplate,
} from '../../features/templates/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { LoadErrorView } from '../../components/LoadErrorView';
import { describeRecurrence, weekdayName } from '../../lib/recurrence';
import { BottomSheet } from '../../components/BottomSheet';
import { LoadingScreen, FadeIn } from '../../components/Motion';
import { colors, spacing, radii, MISSION_CATEGORIES } from '../../theme';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default function TemplatesScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [isAdmin, setIsAdmin] = useState(false);
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      const membership = await getMyMembership(houseId);
      setIsAdmin(membership?.role === 'admin');
      setTemplates(await getTemplates(houseId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [houseId]);

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
      });
      setTitle('');
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(templateId: string) {
    setFormError(null);
    try {
      await deleteTemplate(houseId, templateId);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : null);
    }
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

  if (loading) {
    return <LoadingScreen />;
  }

  if (loadError !== null) {
    return <LoadErrorView message={loadError} onRetry={load} testID="templates-load-error" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="repeat-outline" size={26} color={colors.ink} />
        <Text style={styles.title}>{t('templates.title')}</Text>
      </View>

      {!isAdmin && (
        <Text testID="templates-admin-only" style={styles.adminOnlyText}>
          {t('templates.adminOnly')}
        </Text>
      )}

      {templates.length === 0 && <Text style={styles.emptyText}>{t('templates.empty')}</Text>}

      {templates.map((template) => (
        <Card key={template.id} testID={`template-${template.id}`} style={styles.templateCard}>
          <CategoryIcon category={template.category} size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.templateTitle}>{template.title}</Text>
            <Text style={styles.templateMeta}>
              {describeRecurrence(template.recurrence_rule)} · {template.points}
            </Text>
          </View>
          {isAdmin && (
            <AnimatedPressable
              onPress={() => handleRemove(template.id)}
              testID={`template-remove-${template.id}`}
              accessibilityLabel={t('templates.remove')}
            >
              <Ionicons name="trash-outline" size={18} color={colors.rose} />
            </AnimatedPressable>
          )}
        </Card>
      ))}

      {isAdmin && (
        <>
          <AnimatedPressable onPress={() => setFormOpen(true)} testID="template-open-form" style={styles.primaryButton}>
            <Ionicons name="add-circle-outline" size={18} color={colors.cream} />
            <Text style={styles.primaryButtonText}>{t('templates.addTitle')}</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleGenerate}
            disabled={busy || templates.length === 0}
            testID="templates-generate"
            style={styles.secondaryButton}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.ink} />
            <Text style={styles.secondaryButtonText}>{t('templates.generate')}</Text>
          </AnimatedPressable>

          {generatedCount !== null && (
            <Text testID="templates-generated" style={styles.generatedText}>
              {generatedCount > 0 ? t('templates.generated', { count: generatedCount }) : t('templates.generatedNone')}
            </Text>
          )}

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
            {MISSION_CATEGORIES.map((cat) => (
              <AnimatedPressable
                key={cat}
                onPress={() => setCategory(cat)}
                testID={`template-category-${cat}`}
                style={[styles.chip, category === cat && styles.chipActive]}
              >
                <CategoryIcon category={cat} size={14} />
                <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                  {t(`missions.categories.${cat}`)}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <Text style={styles.label}>{t('templates.recurrenceLabel')}</Text>
          <View style={styles.chipRow}>
            <AnimatedPressable
              onPress={() => setFrequency('weekly')}
              testID="template-frequency-weekly"
              style={[styles.chip, frequency === 'weekly' && styles.chipActive]}
            >
              <Text style={[styles.chipText, frequency === 'weekly' && styles.chipTextActive]}>
                {t('templates.weekly')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setFrequency('monthly')}
              testID="template-frequency-monthly"
              style={[styles.chip, frequency === 'monthly' && styles.chipActive]}
            >
              <Text style={[styles.chipText, frequency === 'monthly' && styles.chipTextActive]}>
                {t('templates.monthly')}
              </Text>
            </AnimatedPressable>
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

          {formError && (
            <Text testID="templates-error" style={styles.errorText}>
              {formError}
            </Text>
          )}

          <AnimatedPressable
            onPress={handleAdd}
            disabled={busy || !title || !points}
            testID="template-add"
            style={styles.primaryButton}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.cream} />
            <Text style={styles.primaryButtonText}>{t('templates.add')}</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleGenerate}
            disabled={busy || templates.length === 0}
            testID="templates-generate"
            style={styles.secondaryButton}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.ink} />
            <Text style={styles.secondaryButtonText}>{t('templates.generate')}</Text>
          </AnimatedPressable>

          {generatedCount !== null && (
            <Text testID="templates-generated" style={styles.generatedText}>
              {generatedCount > 0 ? t('templates.generated', { count: generatedCount }) : t('templates.generatedNone')}
            </Text>
          )}
          </BottomSheet>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionTitle: {
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.lg,
  },
  label: {
    color: colors.textMuted,
  },
  adminOnlyText: {
    color: colors.amber,
  },
  emptyText: {
    color: colors.textMuted,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  templateTitle: {
    fontWeight: '700',
    color: colors.ink,
  },
  templateMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 44,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  chipText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.cream,
  },
  errorText: {
    color: colors.rose,
  },
  generatedText: {
    color: colors.sage,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  primaryButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontWeight: '700',
  },
});
