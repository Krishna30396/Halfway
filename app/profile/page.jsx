'use client';

import { useRouter } from 'next/navigation';
import ProfileScreen from '@/components/ProfileScreen';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { useFriends } from '@/lib/useFriends';

export default function ProfilePage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const f = useFriends();
  return (
    <ProfileScreen
      f={f}
      supabase={getSupabase()}
      onSignOut={async () => {
        await signOut();
        router.push('/');
      }}
    />
  );
}
