'use client';

import MeetupsScreen from '@/components/MeetupsScreen';
import { getSupabase } from '@/lib/supabase';
import { useFriends } from '@/lib/useFriends';

export default function FriendsPage() {
  const f = useFriends();
  return <MeetupsScreen f={f} supabase={getSupabase()} />;
}
