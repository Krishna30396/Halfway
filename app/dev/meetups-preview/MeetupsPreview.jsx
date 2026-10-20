'use client';

import MeetupsScreen from '@/components/MeetupsScreen';
import { SAMPLE } from '../friends-preview/FriendsPreview';

export default function MeetupsPreview() {
  return <MeetupsScreen f={{ ...SAMPLE, outgoing: [{ id: 'f4', requester: 'me', addressee: 'u3', status: 'pending' }] }} supabase={{}} />;
}
