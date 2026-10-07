import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createClient } from '@supabase/supabase-js';
import { haversine } from '@/lib/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The test notification waits a few seconds so there's time to lock the phone.
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARRIVE_KM = 0.3;

// sender: which meetup column must equal the caller ('any' = either participant).
// sticky: stays on screen until tapped — used for things that need an answer.
const MEETUP_TYPES = {
  meet_request: {
    status: ['requested'],
    sender: 'created_by',
    urgency: 'high',
    sticky: true,
    title: (n) => `${n} wants to meet up`,
    body: () => 'Tap to share your location and pick a place together.',
  },
  meet_cancelled: {
    status: ['cancelled'],
    sender: 'created_by',
    urgency: 'normal',
    title: (n) => `${n} cancelled the meetup`,
    body: () => 'No worries — you can start a new one any time.',
  },
  meet_accepted: {
    status: ['planning'],
    sender: 'invitee',
    urgency: 'high',
    title: (n) => `${n} is in!`,
    body: () => "You can see each other now. Pick a place to meet.",
  },
  meet_declined: {
    status: ['declined'],
    sender: 'invitee',
    urgency: 'normal',
    title: (n) => `${n} can't meet right now`,
    body: () => 'Your meetup request was declined.',
  },
  place_proposed: {
    status: ['planning'],
    sender: 'proposed_by',
    urgency: 'high',
    sticky: true,
    title: (n) => `${n} suggested a place`,
    body: (m) => `${m.proposal_name} — accept to start live tracking.`,
  },
  place_rejected: {
    status: ['planning'],
    sender: 'any',
    urgency: 'normal',
    title: (n) => `${n} passed on that place`,
    body: () => 'Suggest somewhere else.',
  },
  place_agreed: {
    status: ['live'],
    sender: 'any',
    urgency: 'high',
    title: (n, m) => `You're meeting at ${m.dest_name}`,
    body: (n) => `${n} accepted. Live tracking is on — tap to see them.`,
  },
  arrived: {
    status: ['live'],
    sender: 'any',
    urgency: 'high',
    ttl: 600,
    title: (n) => `${n} has arrived`,
    body: (n, m) => `They're at ${m.dest_name}.`,
  },
  meet_ended: {
    status: ['ended'],
    sender: 'any',
    urgency: 'normal',
    title: (n) => `${n} ended the meetup`,
    body: () => 'Location sharing has stopped.',
  },
};

const FRIEND_TYPES = {
  friend_request: {
    status: 'pending',
    sender: 'requester',
    recipient: 'addressee',
    title: (n) => `${n} wants to be friends`,
    body: () => 'Accept to plan meetups together.',
  },
  friend_accepted: {
    status: 'accepted',
    sender: 'addressee',
    recipient: 'requester',
    title: (n) => `${n} accepted your friend request`,
    body: () => 'You can now meet up on Halfway.',
  },
};

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidReady = false;
function webPushReady() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@halfway.app', pub, priv);
    vapidReady = true;
  }
  return true;
}

const FCM_APP = 'halfway-fcm';
let fcmFailed = false;
function getFcm() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw || fcmFailed) return null;
  try {
    const app =
      getApps().find((a) => a.name === FCM_APP) ||
      initializeApp(
        {
          credential: cert(
            JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
          ),
        },
        FCM_APP
      );
    return getMessaging(app);
  } catch (err) {
    fcmFailed = true;
    console.error('FIREBASE_SERVICE_ACCOUNT is invalid:', err.message);
    return null;
  }
}

// FCM says this token will never work again (app uninstalled / data cleared).
const DEAD_FCM_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// Collapse double-taps / retries within a short window (per server instance).
const recent = new Map();
function isDuplicate(key) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 15000) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

const fail = (error, status) => Response.json({ error }, { status });

export async function POST(request) {
  const admin = getAdmin();
  const webPush = webPushReady();
  const fcm = getFcm();
  if (!admin || (!webPush && !fcm)) {
    return fail('Notifications are not configured on the server.', 503);
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail('Not signed in.', 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const caller = authData?.user?.id;
  if (authError || !caller) return fail('Not signed in.', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Bad request.', 400);
  }
  const { type, id } = body || {};
  if (type !== 'test' && (typeof id !== 'string' || !UUID_RE.test(id))) return fail('Bad id.', 400);

  let recipient;
  let title;
  let text;
  let url;
  let tag;
  let urgency = 'normal';
  let sticky = false;
  let ttl = 3600;

  const senderName = async () => {
    const { data } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', caller)
      .maybeSingle();
    return data?.display_name || (data?.username ? `@${data.username}` : 'Your friend');
  };

  if (type === 'test') {
    // Only ever to the caller's own devices.
    recipient = caller;
    title = 'Halfway test alert';
    text = 'If you can read this on your lock screen, alerts will reach you.';
    url = '/friends';
    tag = 'test';
    urgency = 'high';
  } else if (FRIEND_TYPES[type]) {
    const rule = FRIEND_TYPES[type];
    const { data: f } = await admin.from('friendships').select('*').eq('id', id).maybeSingle();
    if (!f || f.status !== rule.status || f[rule.sender] !== caller) {
      return fail('Not allowed.', 403);
    }
    recipient = f[rule.recipient];
    const n = await senderName();
    title = rule.title(n);
    text = rule.body(n);
    url = '/friends';
    tag = `friend-${id}`;
  } else if (MEETUP_TYPES[type]) {
    const rule = MEETUP_TYPES[type];
    const { data: m } = await admin.from('meetups').select('*').eq('id', id).maybeSingle();
    if (!m || ![m.created_by, m.invitee].includes(caller)) return fail('Not allowed.', 403);
    if (!rule.status.includes(m.status)) return fail('Meetup is not in the right state.', 409);
    if (rule.sender !== 'any' && m[rule.sender] !== caller) return fail('Not allowed.', 403);
    if (type === 'place_proposed' && m.proposal_lat == null) return fail('No proposal.', 409);

    if (type === 'arrived') {
      const { data: loc } = await admin
        .from('live_locations')
        .select('lat, lng')
        .eq('meetup_id', id)
        .eq('user_id', caller)
        .maybeSingle();
      if (!loc || haversine([loc.lat, loc.lng], [m.dest_lat, m.dest_lng]) > ARRIVE_KM) {
        return fail('Not at the destination yet.', 409);
      }
    }

    recipient = caller === m.created_by ? m.invitee : m.created_by;
    const n = await senderName();
    title = rule.title(n, m);
    text = rule.body(n, m);
    url = `/meet/${id}`;
    tag = `meet-${id}`;
    urgency = rule.urgency;
    sticky = !!rule.sticky;
    if (rule.ttl) ttl = rule.ttl;
  } else {
    return fail('Unknown notification type.', 400);
  }

  if (isDuplicate(`${caller}:${type}:${id}`)) return Response.json({ ok: true, sent: 0 });
  if (type === 'test') {
    const delay = Math.min(10, Math.max(0, Number(body.delaySec) || 0));
    await new Promise((r) => setTimeout(r, delay * 1000));
  }

  let sent = 0;

  const sendWebPush = async () => {
    if (!webPush) return;
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', recipient);

    const payload = JSON.stringify({ title, body: text, url, tag, requireInteraction: sticky });
    await Promise.all(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: ttl, urgency }
          );
          sent++;
        } catch (err) {
          // The device unsubscribed or reinstalled — forget it.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', s.id);
          }
        }
      })
    );
  };

  const sendFcm = async () => {
    if (!fcm) return;
    const { data: devices } = await admin
      .from('device_tokens')
      .select('token')
      .eq('user_id', recipient);
    const tokens = (devices || []).map((d) => d.token);
    if (!tokens.length) return;
    try {
      const res = await fcm.sendEachForMulticast({
        tokens,
        notification: { title, body: text },
        data: { url, tag },
        android: {
          priority: 'high',
          ttl: ttl * 1000,
          // Public + max priority: shown in full on the lock screen and as a
          // heads-up banner over other apps (the channel is high-importance too).
          notification: {
            channelId: 'halfway_alerts',
            tag,
            sound: 'default',
            defaultVibrateTimings: true,
            visibility: 'public',
            notificationPriority: 'PRIORITY_MAX',
          },
        },
      });
      sent += res.successCount;
      const dead = tokens.filter((_, i) => DEAD_FCM_CODES.has(res.responses[i]?.error?.code));
      if (dead.length) await admin.from('device_tokens').delete().in('token', dead);
    } catch (err) {
      console.error('FCM send failed:', err.message);
    }
  };

  await Promise.all([sendWebPush(), sendFcm()]);

  return Response.json({ ok: true, sent });
}
