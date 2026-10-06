import { createBrowserClient } from '@supabase/ssr';

let client = null;

export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The Vercel–Supabase integration may provide either key name.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client = createBrowserClient(url, key);
  return client;
}
