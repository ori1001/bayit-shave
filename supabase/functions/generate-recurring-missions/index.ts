import { createClient } from 'npm:@supabase/supabase-js@2';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toDateString(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Dates a rule fires on within [from, to] inclusive.
 *
 * Supported rules, matching the format the schema documents:
 *   weekly:<weekday>       e.g. "weekly:fri"
 *   monthly:<day-of-month> e.g. "monthly:15"
 *
 * Deliberately not a full RRULE implementation -- anything unrecognised
 * yields no dates rather than guessing, so a typo cannot silently schedule
 * chores on the wrong days.
 */
export function datesForRule(rule: string, from: Date, to: Date): string[] {
  const [kind, rawArg] = String(rule).toLowerCase().split(':');
  const arg = (rawArg ?? '').trim();
  const dates: string[] = [];

  if (kind === 'weekly') {
    const weekday = WEEKDAYS.indexOf(arg);
    if (weekday < 0) {
      return [];
    }
    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === weekday) {
        dates.push(toDateString(d));
      }
    }
    return dates;
  }

  if (kind === 'monthly') {
    const dayOfMonth = Number(arg);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return [];
    }
    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDate() === dayOfMonth) {
        dates.push(toDateString(d));
      }
    }
    return dates;
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { house_id, from, to } = await req.json();
  if (!house_id) {
    return new Response(JSON.stringify({ error: 'house_id_required' }), { status: 400 });
  }

  const fromDate = from ? new Date(`${from}T00:00:00Z`) : new Date();
  // Default horizon: the coming four weeks, enough to cover a weekly or
  // monthly rule without generating instances indefinitely far ahead.
  const toDate = to ? new Date(`${to}T00:00:00Z`) : new Date(fromDate.getTime() + 28 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
    return new Response(JSON.stringify({ error: 'invalid_date_range' }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const { data: callerMember, error: callerError } = await admin
    .from('members')
    .select('id, role')
    .eq('house_id', house_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (callerError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!callerMember) {
    return new Response(JSON.stringify({ error: 'not_a_member_of_this_house' }), { status: 403 });
  }
  if (callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  const { data: templates, error: templatesError } = await admin
    .from('mission_templates')
    .select('id, title, category, points, recurrence_rule, default_assignee')
    .eq('house_id', house_id);
  if (templatesError) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }

  const rows = [];
  for (const template of templates ?? []) {
    for (const dueDate of datesForRule(template.recurrence_rule, fromDate, toDate)) {
      rows.push({
        template_id: template.id,
        house_id,
        title: template.title,
        category: template.category,
        points: template.points,
        due_date: dueDate,
        // A template with a default assignee produces an already-assigned
        // instance; otherwise it goes to the pool for the balance run.
        assigned_to: template.default_assignee ?? null,
        status: template.default_assignee ? 'assigned' : 'open',
        created_by: callerMember.id,
        assignment_mode: template.default_assignee ? 'direct' : 'auto',
      });
    }
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ created: 0, instances: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ignoreDuplicates leans on the (template_id, due_date) unique index so a
  // re-run is a no-op rather than a second set of chores.
  const { data: inserted, error: insertError } = await admin
    .from('mission_instances')
    .upsert(rows, { onConflict: 'template_id,due_date', ignoreDuplicates: true })
    .select();
  if (insertError) {
    return new Response(JSON.stringify({ error: 'generation_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ created: inserted?.length ?? 0, instances: inserted ?? [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
