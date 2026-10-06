import { getSupabase } from './supabase';

export async function saveSearch({ userId, a, b, hubName, url }) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.from('saved_searches').insert({
    user_id: userId,
    name_a: a?.name || null,
    name_b: b?.name || null,
    hub_name: hubName || null,
    url,
  }).select().single();

  if (error) throw error;
  return data;
}

export async function getSavedSearches(userId) {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return [];
  return data || [];
}
