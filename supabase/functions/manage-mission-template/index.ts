import { createClient } from 'npm:@supabase/supabase-js@2';

const CATEGORIES = ['dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Mirrors what generate-recurring-missions can actually interpret. */
function isSupportedRule(rule: unknown): boolean {
  if (typeof rule !== 'string') {
    return false;
  }
  const [kind, arg] = rule.toLowerCase().split(':');
  if (kind === 'weekly') {
    return WEEKDAYS.includes((arg ?? '').trim());
  }
  if (kind === 'monthly') {
    const day = Number((arg ?? '').trim());
    return Number.isInteger(day) && day >= 1 && day <= 31;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401 });
  }

  const { action, house_id, template_id, title, category, points, recurrence_rule, default_assignee, eligible_members } =
    await req.json();

  if (action !== 'create' && action !== 'delete') {
    return new Response(JSON.stringify({ error: 'invalid_action' }), { status: 400 });
  }
  if (!house_id) {
    return new Response(JSON.stringify({ error: 'house_id_required' }), { status: 400 });
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
  // Templates define the house's recurring schedule, so they are admin-only.
  if (callerMember.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'admin_only' }), { status: 403 });
  }

  if (action === 'delete') {
    if (!template_id) {
      return new Response(JSON.stringify({ error: 'template_id_required' }), { status: 400 });
    }
    const { error } = await admin
      .from('mission_templates')
      .delete()
      .eq('id', template_id)
      .eq('house_id', house_id);
    if (error) {
      return new Response(JSON.stringify({ error: 'template_delete_failed' }), { status: 500 });
    }
    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!title || !CATEGORIES.includes(category)) {
    return new Response(JSON.stringify({ error: 'title_and_valid_category_required' }), { status: 400 });
  }
  if (!Number.isInteger(points) || points <= 0) {
    return new Response(JSON.stringify({ error: 'invalid_points' }), { status: 400 });
  }
  // Rejecting an uninterpretable rule here means a template can never be saved
  // in a state where generation would silently produce nothing.
  if (!isSupportedRule(recurrence_rule)) {
    return new Response(JSON.stringify({ error: 'unsupported_recurrence_rule' }), { status: 400 });
  }

  const { data: created, error: insertError } = await admin
    .from('mission_templates')
    .insert({
      house_id,
      title,
      category,
      points,
      recurrence_rule: String(recurrence_rule).toLowerCase(),
      default_assignee: default_assignee ?? null,
      eligible_members: eligible_members ?? null,
    })
    .select()
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: 'template_create_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ template: created }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
