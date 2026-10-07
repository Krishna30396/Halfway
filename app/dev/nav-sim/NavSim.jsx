'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { pointAtFraction } from '@/lib/geo';
import { useLiveRoute } from '@/lib/navigation';
import NavBanner from '@/components/NavBanner';
import s from '@/components/Social.module.css';

const NavigationMap = dynamic(() => import('@/components/NavigationMap'), { ssr: false });

const DEST = { lat: 17.4486, lng: 78.3908, name: 'Pinned spot' };
const ME_START = { lat: 17.5106, lng: 78.3866 };
const FRIEND_START = { lat: 17.4239, lng: 78.4209 };

async function pathTo(from) {
  const r = await fetch(`/api/route?from=${from.lat},${from.lng}&to=${DEST.lat},${DEST.lng}`).then((x) => x.json());
  return r.routes[0].coords;
}

const at = (coords, f) => {
  const p = pointAtFraction(coords, f).point;
  return { lat: p[0], lng: p[1] };
};

// ?me=0.3&friend=0.5&pov=friend&play=1
export default function NavSim() {
  const [params, setParams] = useState(null);
  const [paths, setPaths] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({
      me: parseFloat(q.get('me') || '0.2'),
      friend: parseFloat(q.get('friend') || '0.4'),
      pov: q.get('pov') === 'friend' ? 'friend' : 'me',
      play: q.get('play') === '1',
    });
    Promise.all([pathTo(ME_START), pathTo(FRIEND_START)]).then(([me, friend]) => setPaths({ me, friend }));
  }, []);

  useEffect(() => {
    if (!params?.play) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [params?.play]);

  const fMe = params ? Math.min(1, params.me + tick * 0.004) : 0;
  const fFriend = params ? Math.min(1, params.friend + tick * 0.004) : 0;
  const myPos = paths ? at(paths.me, fMe) : null;
  const friendPos = paths ? at(paths.friend, fFriend) : null;

  const myNav = useLiveRoute(myPos, DEST);
  const friendNav = useLiveRoute(friendPos, DEST, { offRouteM: 150, minGapMs: 30000 });

  if (!params) return null;
  const viewing = params.pov;
  const viewNav = viewing === 'friend' ? friendNav : myNav;
  const viewPos = viewing === 'friend' ? friendPos : myPos;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1 }} className={s.meetNav}>
        <NavigationMap
          focus={viewPos}
          focusIs={viewing}
          bearing={viewNav.progress?.bearing ?? 0}
          route={viewNav.nav?.coords}
          routeColor={viewing === 'friend' ? '#6E4F8C' : '#2F6F5E'}
          altRoute={(viewing === 'friend' ? myNav : friendNav).nav?.coords}
          altRouteColor={viewing === 'friend' ? '#2F6F5E' : '#6E4F8C'}
          me={myPos}
          meLetter="K"
          friend={friendPos}
          friendLetter="G"
          dest={DEST}
        />
        <NavBanner who={viewing === 'friend' ? '@guy' : 'You'} isMe={viewing === 'me'} pos={viewPos} live={viewNav} arrived={false} />
      </div>
      <div
        id="sim-status"
        style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace', background: 'var(--panel)', color: 'var(--ink)' }}
      >
        pov={viewing} me={Math.round(fMe * 100)}% friend={Math.round(fFriend * 100)}% bearing=
        {Math.round(viewNav.progress?.bearing ?? -1)} route={viewNav.nav ? 'yes' : 'no'} next=
        {viewNav.progress?.next?.instruction || '-'} error={viewNav.error || '-'}
      </div>
    </div>
  );
}
