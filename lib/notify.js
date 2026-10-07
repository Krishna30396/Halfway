import { getSupabase } from './supabase';

/**
 * Ask the server to push a notification to the OTHER person in a friendship or
 * meetup. The server derives the recipient and the wording from the database,
 * so a client can't send arbitrary text to arbitrary people.
 */
export async function notify(type, id) {
  const supabase = getSupabase();
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type, id }),
      keepalive: true,
    });
  } catch {
    // Realtime still updates the other phone if the app is open.
  }
}

/** Sends a test alert to this account's own devices after `delaySec`. Resolves to { sent, report }. */
export async function sendTestNotification(delaySec = 5) {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in first.');
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ type: 'test', delaySec }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't send the test.");
  return data;
}
