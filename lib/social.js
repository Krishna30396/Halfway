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

// An invite link (/friends?add=name) must survive sign-up, so it's parked here
// until the new user has a username and the request can be sent.
const PENDING_KEY = 'halfway-pending-invite';

export function savePendingInvite(username) {
  try {
    localStorage.setItem(PENDING_KEY, username.toLowerCase());
  } catch {}
}

export function takePendingInvite() {
  try {
    const value = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return value;
  } catch {
    return null;
  }
}

export function hasPendingInvite() {
  try {
    return !!localStorage.getItem(PENDING_KEY);
  } catch {
    return false;
  }
}

export function displayName(p) {
  return p?.display_name || (p?.username ? `@${p.username}` : 'Your friend');
}

export function initialOf(p) {
  return (p?.display_name || p?.username || '?').trim().charAt(0).toUpperCase() || '?';
}
