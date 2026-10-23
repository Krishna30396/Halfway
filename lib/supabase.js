import { createBrowserClient } from '@supabase/ssr';
import { backgroundSafeFetch } from './native';

let client = null;

export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The Vercel–Supabase integration may provide either key name.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // Sign-in token refreshes keep working while the Android app is in the
  // background (location uploads need a fresh token after an hour). Only the
  // auth endpoints take the native path; everything else is plain fetch.
  const fetchFor = (input, init) =>
    String(typeof input === 'string' ? input : input?.url || '').includes('/auth/v1/')
      ? backgroundSafeFetch(input, init)
      : fetch(input, init);
  client = createBrowserClient(url, key, { global: { fetch: fetchFor } });
  return client;
}
