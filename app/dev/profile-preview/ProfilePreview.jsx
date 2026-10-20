'use client';

import ProfileScreen from '@/components/ProfileScreen';
import { SAMPLE } from '../friends-preview/FriendsPreview';

// Pretends every save works, so the picker and chips can be tried.
const fakeDb = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) };

export default function ProfilePreview() {
  const f = {
    ...SAMPLE,
    me: { ...SAMPLE.me, avatar: 'f1', default_radius: 3, preferred_categories: ['cafe', 'restaurant'] },
  };
  return <ProfileScreen f={f} supabase={fakeDb} onSignOut={() => {}} />;
}
