import { getSupabase } from './supabase';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function fetchProfiles(ids) {
  const supabase = getSupabase();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!supabase || !unique.length) return {};
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .in('id', unique);
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}

export function displayName(p) {
  return p?.display_name || (p?.username ? `@${p.username}` : 'Your friend');
}

export function initialOf(p) {
  return (p?.display_name || p?.username || '?').trim().charAt(0).toUpperCase() || '?';
}
