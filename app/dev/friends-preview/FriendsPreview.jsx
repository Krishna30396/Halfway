'use client';

import { FriendsWidgetView } from '@/components/FriendsWidget';

const people = {
  u1: { id: 'u1', username: 'paani', display_name: 'paani', avatar: 'f2' },
  u2: { id: 'u2', username: 'vashishta', display_name: 'VASHISHTA', avatar: 'f6' },
  u3: { id: 'u3', username: 'meera', display_name: 'Meera' },
};

export const SAMPLE = {
  configured: true,
  loaded: true,
  user: { id: 'me' },
  me: { id: 'me', username: 'krishna', display_name: 'Krishna' },
  people,
  meetups: [
    { id: 'm1', created_by: 'me', invitee: 'u1', status: 'planning' },
    { id: 'm2', created_by: 'u2', invitee: 'me', status: 'planning' },
  ],
  incoming: [{ id: 'f3', requester: 'u3', addressee: 'me', status: 'pending' }],
  outgoing: [],
  friends: [
    { id: 'f1', requester: 'me', addressee: 'u1', status: 'accepted' },
    { id: 'f2', requester: 'u2', addressee: 'me', status: 'accepted' },
  ],
  attentionCount: 1,
  inviteResult: null,
  otherOf: (f) => (f.requester === 'me' ? f.addressee : f.requester),
  meetupWith: (id) => SAMPLE.meetups.find((m) => m.created_by === id || m.invitee === id),
  needsMe: () => false,
  reload: () => {},
  accept: async () => 'You and Meera are now friends.',
  remove: async () => {},
  sendRequest: async (u) => `Friend request sent to @${u}.`,
  startMeetup: async () => new Promise(() => {}),
  shareInvite: async () => 'Invite link copied — send it to your friend.',
};

export default function FriendsPreview() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--map-bg)' }}>
      <FriendsWidgetView f={SAMPLE} pathname="/" initialOpen />
    </div>
  );
}
