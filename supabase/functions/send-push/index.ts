// Reelo push delivery (Supabase Edge Function, Deno).
//
// Triggered by a Database Webhook on INSERT into public.notifications (Dashboard -> Database -> Webhooks),
// with an HTTP header `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`. Looks up the recipient's Expo push tokens
// and sends a push via the free Expo Push API. In-app notifications work without this.
//
// Deploy:  npx supabase functions deploy send-push --no-verify-jwt
// Secret:  npx supabase secrets set PUSH_WEBHOOK_SECRET=some-long-random-string

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  payload: { group_name?: string; excerpt?: string };
};

function message(n: NotificationRow, actor: string): { title: string; body: string } {
  switch (n.type) {
    case 'follow':
      return { title: 'New follower', body: `${actor} started following you` };
    case 'follow_request':
      return { title: 'Follow request', body: `${actor} wants to follow you` };
    case 'follow_accepted':
      return { title: 'Request accepted', body: `${actor} accepted your follow request` };
    case 'like_review':
      return { title: 'New like', body: `${actor} liked your review` };
    case 'like_list':
      return { title: 'New like', body: `${actor} liked your list` };
    case 'comment_review':
    case 'comment_list':
      return { title: `${actor} commented`, body: n.payload.excerpt ?? '' };
    case 'group_voting':
      return { title: 'Voting is open! 🍿', body: `${n.payload.group_name ?? 'Your group'}: pick tonight's film` };
    case 'group_closed':
      return { title: 'We have a winner 🏆', body: `${n.payload.group_name ?? 'Your group'} picked a film` };
    case 'group_joined':
      return { title: 'Group update', body: `${actor} joined ${n.payload.group_name ?? 'your group'}` };
    default:
      return { title: 'Reelo', body: 'You have a new notification' };
  }
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-webhook-secret') !== SECRET) return json({ error: 'unauthorized' }, 401);
  const body = await req.json().catch(() => null);
  const n = body?.record as NotificationRow | undefined;
  if (!n?.user_id) return json({ skipped: true });

  const [{ data: tokens }, { data: actor }] = await Promise.all([
    admin.from('push_tokens').select('token').eq('user_id', n.user_id),
    n.actor_id ? admin.from('profiles').select('username').eq('id', n.actor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!tokens?.length) return json({ sent: 0 });

  const { title, body: text } = message(n, actor?.username ?? 'Someone');
  const messages = tokens.map((t) => ({ to: t.token, title, body: text, sound: 'default', data: { type: n.type, payload: n.payload } }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => ({}));
  // Remove tokens Expo reports as no longer registered.
  const tickets: { status: string; details?: { error?: string } }[] = result?.data ?? [];
  const dead = tickets
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter(Boolean);
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  return json({ sent: messages.length, removed: dead.length });
});
