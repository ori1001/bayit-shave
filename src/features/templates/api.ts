import { supabase } from '../../lib/supabase';
import type { MissionCategory } from '../missions/api';

export interface MissionTemplate {
  id: string;
  house_id: string;
  title: string;
  category: MissionCategory;
  points: number;
  /** "weekly:<weekday>" or "monthly:<day-of-month>" */
  recurrence_rule: string;
  default_assignee: string | null;
  eligible_members: string[] | null;
  last_assigned_to: string | null;
}

export interface NewMissionTemplate {
  house_id: string;
  title: string;
  category: MissionCategory;
  points: number;
  recurrence_rule: string;
  default_assignee?: string | null;
  eligible_members?: string[] | null;
}

export async function getTemplates(houseId: string): Promise<MissionTemplate[]> {
  const { data, error } = await supabase
    .from('mission_templates')
    .select('id, house_id, title, category, points, recurrence_rule, default_assignee, eligible_members, last_assigned_to')
    .eq('house_id', houseId);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as MissionTemplate[];
}

async function throwFromInvokeError(error: { message: string; context?: Response }): Promise<never> {
  const body = error.context ? await error.context.json().catch(() => null) : null;
  throw new Error((body as { error?: string } | null)?.error ?? error.message);
}

/**
 * Template writes go through an Edge Function: `mission_templates` grants
 * `authenticated` select only, so a direct insert or delete from the client
 * would be rejected by RLS. The function also re-checks admin role.
 */
export async function createTemplate(input: NewMissionTemplate): Promise<MissionTemplate> {
  const { data, error } = await supabase.functions.invoke('manage-mission-template', {
    body: { action: 'create', ...input },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
  return data.template as MissionTemplate;
}

export async function deleteTemplate(houseId: string, templateId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('manage-mission-template', {
    body: { action: 'delete', house_id: houseId, template_id: templateId },
  });
  if (error) {
    return throwFromInvokeError(error);
  }
}

/**
 * Instantiates every template's rule across the horizon. Safe to call more than
 * once: the (template_id, due_date) unique index makes a repeat run a no-op
 * rather than a duplicate set of chores.
 */
export async function generateRecurringMissions(
  houseId: string,
  range?: { from?: string; to?: string }
): Promise<{ created: number }> {
  const { data, error } = await supabase.functions.invoke('generate-recurring-missions', {
    body: { house_id: houseId, ...(range?.from ? { from: range.from } : {}), ...(range?.to ? { to: range.to } : {}) },
  });
  if (error) {
    const body = error.context ? await error.context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  return data;
}
