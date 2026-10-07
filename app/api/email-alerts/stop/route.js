import { createClient } from '@supabase/supabase-js';
import { validUnsubscribe } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const page = (title, body, form = '') =>
  new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#F3F1EA;color:#1E2A24;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="max-width:380px;background:#fff;border-radius:14px;padding:28px;text-align:center">
<h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="color:#4A5850;line-height:1.5;margin:0">${body}</p>${form}</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

function params(request) {
  const q = new URL(request.url).searchParams;
  const u = q.get('u');
  const t = q.get('t');
  return u && UUID_RE.test(u) && validUnsubscribe(u, t) ? u : null;
}

// Opening the link only asks: mail scanners pre-open links, and that
// shouldn't switch anyone's emails off.
export async function GET(request) {
  if (!params(request)) return page('Link not valid', 'This link is broken or out of date.');
  const action = new URL(request.url);
  return page(
    'Stop Halfway emails?',
    "You'll stop getting emails about friend requests and meetups. You can turn them back on in Halfway.",
    `<form method="post" action="${action.pathname}${action.search}"><button style="margin-top:18px;background:#2F6F5E;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600">Stop emails</button></form>`
  );
}

// The button above, and one-click unsubscribe from Gmail's own button.
export async function POST(request) {
  const userId = params(request);
  if (!userId) return page('Link not valid', 'This link is broken or out of date.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from('email_alerts').update({ enabled: false }).eq('user_id', userId);
  if (error) return page('Something went wrong', 'Please try again in a minute.');
  return page('Emails stopped', "You won't get Halfway emails any more. Turn them back on any time in Halfway → Friends.");
}
