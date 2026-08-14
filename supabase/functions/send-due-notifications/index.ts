import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Expo's push API accepts at most 100 messages per request.
 */
async function sendInBatches(messages: PushMessage[]): Promise<number> {
  let delivered = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) {
      delivered += batch.length;
    }
  }
  return delivered;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  // Intended to be driven by a schedule (pg_cron / scheduled invocation) rather
  // than by a user, so it authenticates with the service-role key directly
  // instead of a caller session.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const provided = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (provided !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'service_role_required' }), { status: 403 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'bayit_shave' } });

  const body = await req.json().catch(() => ({}));
  const today: string = body.today ?? new Date().toISOString().slice(0, 10);

  // Anything still assigned and not done: due today gets the morning reminder,
  // anything older is overdue and keeps escalating until it is completed.
  const { data: missions, error } = await admin
    .from('mission_instances')
    .select('id, title, due_date, assigned_to, status')
    .eq('status', 'assigned')
    .lte('due_date', today)
    .not('assigned_to', 'is', null);
  if (error) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), { status: 500 });
  }
  if (!missions || missions.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const memberIds = [...new Set(missions.map((m) => m.assigned_to))];
  const { data: members } = await admin.from('members').select('id, push_token').in('id', memberIds);
  const tokenByMember = new Map((members ?? []).map((m) => [m.id, m.push_token]));

  // Skip anything already pushed today for this mission+kind, so repeated runs
  // in one day do not re-notify.
  const { data: alreadySent } = await admin
    .from('mission_notifications')
    .select('mission_instance_id, kind')
    .eq('sent_on', today);
  const sentKeys = new Set((alreadySent ?? []).map((r) => `${r.mission_instance_id}:${r.kind}`));

  const messages: PushMessage[] = [];
  const ledgerRows: { mission_instance_id: string; member_id: string; kind: string; sent_on: string }[] = [];

  for (const mission of missions) {
    const kind = mission.due_date === today ? 'due' : 'overdue';
    if (sentKeys.has(`${mission.id}:${kind}`)) {
      continue;
    }
    const token = tokenByMember.get(mission.assigned_to);
    if (!token) {
      continue;
    }
    messages.push({
      to: token,
      title: kind === 'due' ? 'Mission due today' : 'Mission overdue',
      body: kind === 'due' ? mission.title : `${mission.title} — still not done`,
      data: { mission_instance_id: mission.id, kind },
    });
    ledgerRows.push({
      mission_instance_id: mission.id,
      member_id: mission.assigned_to,
      kind,
      sent_on: today,
    });
  }

  if (messages.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const delivered = await sendInBatches(messages);

  // Recorded after the send so a failed push is retried on the next run rather
  // than being marked as delivered.
  if (delivered > 0) {
    await admin.from('mission_notifications').upsert(ledgerRows, {
      onConflict: 'mission_instance_id,kind,sent_on',
      ignoreDuplicates: true,
    });
  }

  return new Response(JSON.stringify({ sent: delivered }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
