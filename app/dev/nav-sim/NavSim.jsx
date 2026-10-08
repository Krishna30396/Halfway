'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { pointAtFraction, haversine } from '@/lib/geo';
import { useLiveRoute, fmtMin } from '@/lib/navigation';
import { withSpeed } from '@/lib/liveTracking';
import NavBanner from '@/components/NavBanner';
import FriendSpot from '@/components/FriendSpot';
import NotificationToggle from '@/components/NotificationToggle';
import FairSpots from '@/components/meet/FairSpots';
import {
  MeetHeader,
  StatusPill,
  MapControls,
  DestCard,
  PeopleList,
  HalfwayRow,
  meetStatusPill,
  etaTags,
} from '@/components/meet/MeetChrome';
import { useSheetLayout } from '@/components/meet/useSheetLayout';
import m from '@/components/meet/Meet.module.css';

const NavigationMap = dynamic(() => import('@/components/NavigationMap'), { ssr: false });
const MeetMap = dynamic(() => import('@/components/MeetMap'), { ssr: false });

const DEST = { lat: 17.4486, lng: 78.3908, name: 'Pinned spot' };
const ME_START = { lat: 17.5106, lng: 78.3866 };
const FRIEND_START = { lat: 17.4239, lng: 78.4209 };
const ME = { id: 'me', username: 'krishna', display_name: 'Krishna' };
const FRIEND_NAME = 'paani';
const HALFWAY = { point: [17.4652, 78.4021], hub: { name: 'Kukatpally Housing Board', lat: 17.4652, lng: 78.4021 } };
const PLACES = [
  { id: 'p1', name: 'Roastery Coffee House', category: 'cafe', lat: 17.4671, lng: 78.4003, distanceKm: 0.3 },
  { id: 'p2', name: 'Chutneys', category: 'restaurant', lat: 17.4628, lng: 78.4069, distanceKm: 0.6 },
  { id: 'p3', name: 'KPHB Colony Park', category: 'park', lat: 17.4699, lng: 78.3962, distanceKm: 0.8 },
  { id: 'p4', name: 'Third Wave Coffee', category: 'cafe', lat: 17.4566, lng: 78.4105, distanceKm: 1.3 },
  { id: 'p5', name: 'Paradise Biryani', category: 'restaurant', lat: 17.4805, lng: 78.3951, distanceKm: 1.8 },
];

async function pathTo(from) {
  const r = await fetch(`/api/route?from=${from.lat},${from.lng}&to=${DEST.lat},${DEST.lng}`).then((x) => x.json());
  return r.routes[0].coords;
}

const at = (coords, f) => {
  const p = pointAtFraction(coords, f).point;
  return { lat: p[0], lng: p[1] };
};

// ?state=nav|live|planning  &me=0.3&friend=0.5&pov=friend&play=1  &proposal=1
export default function NavSim() {
  const [params, setParams] = useState(null);
  const [paths, setPaths] = useState(null);
  const [tick, setTick] = useState(0);
  const [pov, setPov] = useState(null);
  const [navMode, setNavMode] = useState(true);
  const [cats, setCats] = useState(['cafe', 'restaurant']);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [recenter, setRecenter] = useState(0);
  const layout = useSheetLayout();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const state = ['planning', 'live', 'nav'].includes(q.get('state')) ? q.get('state') : 'nav';
    setParams({
      state,
      me: parseFloat(q.get('me') || '0.2'),
      friend: parseFloat(q.get('friend') || '0.4'),
      pov: q.get('pov') === 'friend' ? 'friend' : 'me',
      play: q.get('play') === '1',
      proposal: q.get('proposal') === '1',
    });
    setNavMode(state === 'nav');
    if (state !== 'planning') {
      Promise.all([pathTo(ME_START), pathTo(FRIEND_START)]).then(([me, friend]) => setPaths({ me, friend }));
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (params?.play) setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [params?.play]);

  const planning = params?.state === 'planning';
  const fMe = params ? Math.min(1, params.me + tick * 0.004) : 0;
  const fFriend = params ? Math.min(1, params.friend + tick * 0.004) : 0;
  const myPos = planning ? { ...ME_START, accuracy: 12 } : paths ? at(paths.me, fMe) : null;
  const friendPos = planning ? FRIEND_START : paths ? at(paths.friend, fFriend) : null;

  // Like the realtime handler: each new friend fix gets a speed from the last one.
  const [friendLoc, setFriendLoc] = useState(null);
  const [updatedAt] = useState(() => new Date(Date.now() - 5000).toISOString());
  useEffect(() => {
    if (friendPos) setFriendLoc((prev) => withSpeed(prev, { ...friendPos, updated_at: updatedAt }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendPos?.lat, friendPos?.lng]);

  const dest = planning ? null : DEST;
  const myNav = useLiveRoute(planning ? null : myPos, dest);
  const friendNav = useLiveRoute(planning ? null : friendPos, dest, { offRouteM: 150, minGapMs: 30000 });

  if (!params) return null;
  const viewing = (pov || params.pov) === 'friend' ? 'friend' : 'me';
  const viewNav = viewing === 'friend' ? friendNav : myNav;
  const navigating = !planning && navMode;
  const status = planning ? 'planning' : 'live';
  const friendEta = friendNav.progress?.etaMin ?? null;
  const ago = (() => {
    const sec = Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 1000));
    return sec < 3 ? 'just now' : sec < 60 ? `${sec}s ago` : `${Math.round(sec / 60)} min ago`;
  })();
  const friendDistKm = dest && friendLoc ? haversine([friendLoc.lat, friendLoc.lng], [dest.lat, dest.lng]) : null;
  const pill = meetStatusPill({
    status,
    friendName: FRIEND_NAME,
    friendLoc,
    friendArrived: false,
    friendEta,
    friendDistKm,
    friendNav,
    friendAgo: ago,
  });
  const { meTag, friendTag } = etaTags({
    status,
    myPos,
    friendLoc,
    center: HALFWAY.point,
    iArrived: false,
    friendArrived: false,
    myEtaMin: myNav.progress?.etaMin ?? null,
    friendEta,
  });
  const proposal = planning && params.proposal ? { ...PLACES[0], by: 'friend' } : null;
  const fakeBusy = () => {
    setBusy(true);
    setTimeout(() => setBusy(false), 1500);
  };

  // Same components and layout as the real meetup screen.
  return (
    <div ref={layout.rootRef} className={`${m.meet} ${navigating ? m.navigating : ''}`}>
      <div className={m.mapLayer}>
        {navigating ? (
          <NavigationMap
            focus={myPos}
            overview={viewing === 'friend'}
            bearing={myNav.progress?.bearing ?? 0}
            route={myNav.nav?.coords}
            me={myPos}
            meLetter="K"
            friend={friendPos}
            friendLetter="P"
            dest={DEST}
          />
        ) : (
          <MeetMap
            me={myPos}
            meLetter="K"
            friend={friendLoc}
            friendLetter="P"
            friendName={FRIEND_NAME}
            midpoint={planning ? HALFWAY.point : null}
            places={planning ? PLACES : null}
            selectedPlaceId={selected}
            onPlaceSelect={setSelected}
            proposal={proposal}
            dest={dest}
            route={planning ? null : myNav.nav?.coords}
            altRoute={planning ? null : friendNav.nav?.coords}
            fitKey={[!!myPos, !!friendLoc, recenter, layout.wide].join('|')}
            insets={layout.insets}
            meTag={meTag}
            friendTag={friendTag}
            link={planning ? [[myPos.lat, myPos.lng], HALFWAY.point, friendLoc && [friendLoc.lat, friendLoc.lng]] : null}
          />
        )}
      </div>

      <MeetHeader
        me={ME}
        letter="K"
        alert={proposal ? `${FRIEND_NAME} suggested ${proposal.name}` : null}
        menu={<NotificationToggle />}
      >
        {navigating ? (
          <div className={m.bannerSlot}>
            {viewing === 'friend' ? (
              <FriendSpot name={FRIEND_NAME} me={myPos} friend={friendLoc} now={now} />
            ) : (
              <NavBanner who="You" isMe pos={myPos} live={myNav} arrived={false} />
            )}
          </div>
        ) : (
          <StatusPill {...pill} />
        )}
      </MeetHeader>

      <MapControls
        navigating={navigating}
        onFit={() => setRecenter((n) => n + 1)}
        onNavigate={planning ? null : () => setNavMode(true)}
        onExitNav={() => setNavMode(false)}
        pill={
          navigating && (
            <button type="button" className={m.ctrlPill} onClick={() => setPov(viewing === 'me' ? 'friend' : 'me')}>
              {viewing === 'me' ? `See ${FRIEND_NAME}` : 'Back to my route'}
            </button>
          )
        }
      />

      <aside ref={layout.sheetRef} className={m.sheet}>
        <div className={m.handle} aria-hidden="true" />
        {planning ? (
          <>
            {proposal && (
              <section className={m.proposal}>
                <span className={m.kicker}>{FRIEND_NAME} suggested</span>
                <p className={m.proposalName}>{proposal.name}</p>
                <p className={m.proposalMeta}>4.9 km from you · 4.8 km from {FRIEND_NAME}</p>
                <div className={m.row}>
                  <button type="button" className={m.btn} onClick={fakeBusy} disabled={busy}>
                    {busy ? 'Starting…' : 'Accept & start'}
                  </button>
                  <button type="button" className={m.btnGhost} disabled={busy}>
                    Decline
                  </button>
                </div>
              </section>
            )}
            <HalfwayRow name={HALFWAY.hub.name} busy={busy} onSuggest={fakeBusy} />
            <FairSpots
              places={PLACES.filter((p) => cats.includes(p.category))}
              loading={false}
              cats={cats}
              onCats={setCats}
              me={myPos}
              friend={friendLoc}
              friendName={FRIEND_NAME}
              meLetter="K"
              friendLetter="P"
              busy={busy}
              onPick={fakeBusy}
              selectedId={selected}
              onSelect={setSelected}
            />
          </>
        ) : (
          <>
            <DestCard
              name={DEST.name}
              navigating={navigating}
              onNavigate={() => setNavMode(true)}
              onExit={() => setNavMode(false)}
              viewing={viewing}
              onPov={setPov}
              friendName={FRIEND_NAME}
              friendKnown
            />
            <PeopleList
              rows={[
                {
                  key: 'me',
                  me: true,
                  letter: 'K',
                  name: 'You',
                  sub: myNav.progress?.etaMin != null ? `~${fmtMin(myNav.progress.etaMin)} by road` : 'Locating…',
                  km: myNav.progress?.remainingKm ?? null,
                },
                {
                  key: 'friend',
                  letter: 'P',
                  name: FRIEND_NAME,
                  sub: `${friendEta != null ? `~${fmtMin(friendEta)} · ` : ''}updated ${ago}`,
                  km: friendNav.progress?.remainingKm ?? null,
                },
              ]}
            />
          </>
        )}
        <button type="button" className={m.btnDanger}>
          {planning ? 'Cancel meetup' : 'End meetup'}
        </button>
      </aside>

      <div id="sim-status" hidden>
        pov={viewing} route={viewNav.nav ? 'yes' : 'no'} next={viewNav.progress?.next?.instruction || '-'} error=
        {viewNav.error || '-'}
      </div>
    </div>
  );
}
