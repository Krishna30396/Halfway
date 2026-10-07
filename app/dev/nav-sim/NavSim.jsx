'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { pointAtFraction } from '@/lib/geo';
import { useLiveRoute, fmtKm, fmtMin } from '@/lib/navigation';
import NavBanner from '@/components/NavBanner';
import FriendSpot from '@/components/FriendSpot';
import ThemeToggle from '@/components/ThemeToggle';
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
  const [pov, setPov] = useState(null);

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
  const viewing = pov || params.pov;
  const viewNav = viewing === 'friend' ? friendNav : myNav;

  // Same layout and controls as the real meetup screen in navigation mode.
  return (
    <div className={`${s.meet} ${s.meetNav}`}>
      <aside className={s.meetPanel}>
        <div className={s.topBar}>
          <span className={s.back}>← Friends</span>
          <span className={`${s.pill} ${s.pillLive}`}>Live</span>
          <ThemeToggle />
        </div>
        <h1 className={s.meetTitle}>Meeting @guy</h1>
        <section className={s.card}>
          <h2 className={s.cardTitle}>Meeting at</h2>
          <p className={s.proposalName}>{DEST.name}</p>
          <div className={s.actions}>
            <button type="button" className={s.secondary}>
              Exit navigation
            </button>
          </div>
          <div className={s.povSwitch} role="tablist" aria-label="Whose route to follow">
            <button type="button" className={viewing === 'me' ? s.povOn : s.pov} onClick={() => setPov('me')}>
              My route
            </button>
            <button type="button" className={viewing === 'friend' ? s.povOn : s.pov} onClick={() => setPov('friend')}>
              @guy&apos;s location
            </button>
          </div>
        </section>
        <section className={s.card}>
          <div className={s.stat}>
            <div className={s.avatar}>K</div>
            <div className={s.statMain}>
              <div className={s.personName}>You</div>
              <div className={s.personSub}>
                {myNav.progress?.etaMin != null ? `~${fmtMin(myNav.progress.etaMin)} by road` : 'Locating…'}
              </div>
            </div>
            {myNav.progress && <div className={s.statValue}>{fmtKm(myNav.progress.remainingKm)}</div>}
          </div>
          <div className={s.stat}>
            <div className={`${s.avatar} ${s.avatarAlt}`}>G</div>
            <div className={s.statMain}>
              <div className={s.personName}>@guy</div>
              <div className={s.personSub}>
                {friendNav.progress?.etaMin != null
                  ? `~${fmtMin(friendNav.progress.etaMin)} · updated just now`
                  : 'Waiting…'}
              </div>
            </div>
            {friendNav.progress && <div className={s.statValue}>{fmtKm(friendNav.progress.remainingKm)}</div>}
          </div>
        </section>
      </aside>

      <div className={s.meetMap}>
        <NavigationMap
          focus={myPos}
          overview={viewing === 'friend'}
          bearing={myNav.progress?.bearing ?? 0}
          route={myNav.nav?.coords}
          me={myPos}
          meLetter="K"
          friend={friendPos}
          friendLetter="G"
          dest={DEST}
        />
        {viewing === 'friend' ? (
          <FriendSpot name="@guy" me={myPos} friend={friendPos && { ...friendPos, updated_at: new Date().toISOString() }} now={Date.now()} />
        ) : (
          <NavBanner who="You" isMe pos={myPos} live={myNav} arrived={false} />
        )}
        <button type="button" className={s.recenter} onClick={() => setPov(viewing === 'me' ? 'friend' : 'me')}>
          {viewing === 'me' ? 'See @guy' : 'Back to my route'}
        </button>
      </div>

      <div id="sim-status" hidden>
        pov={viewing} route={viewNav.nav ? 'yes' : 'no'} next={viewNav.progress?.next?.instruction || '-'} error=
        {viewNav.error || '-'}
      </div>
    </div>
  );
}
