'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import NotificationToggle from '@/components/NotificationToggle';
import ThemeToggle from '@/components/ThemeToggle';
import CategoryChips from '@/components/CategoryChips';
import LocationInput from '@/components/LocationInput';
import { getSupabase } from '@/lib/supabase';
import { isNativeApp, getBackgroundGeolocation, nativeUpsert } from '@/lib/native';
import { notify } from '@/lib/notify';
import { fetchProfiles, displayName, initialOf } from '@/lib/social';
import { haversine, pointAtFraction } from '@/lib/geo';
import { useLiveRoute, fmtKm, fmtMin } from '@/lib/navigation';
import NavBanner from '@/components/NavBanner';
import FriendSpot from '@/components/FriendSpot';
import { CATEGORIES, CATEGORY_COLORS } from '@/lib/categories';
import s from '@/components/Social.module.css';

const MeetMap = dynamic(() => import('@/components/MeetMap'), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Loading map…</div>,
});
const NavigationMap = dynamic(() => import('@/components/NavigationMap'), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Starting navigation…</div>,
});

const ARRIVE_KM = 0.15;
const MIN_SEND_MS = 8000;
const HEARTBEAT_MS = 30000;
const MIN_MOVE_KM = 0.02;

const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || '';

function fmtAgo(iso, now) {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 15) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min ago` : 'over an hour ago';
}

export default function MeetPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const supabase = getSupabase();

  const [meetup, setMeetup] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [locs, setLocs] = useState({});
  const [myPos, setMyPos] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [geoAttempt, setGeoAttempt] = useState(0);
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const [halfway, setHalfway] = useState(null);
  const [places, setPlaces] = useState(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [cats, setCats] = useState(['cafe', 'restaurant']);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [droppedPin, setDroppedPin] = useState(null);
  const [recenter, setRecenter] = useState(0);
  const [navMode, setNavMode] = useState(false);
  const [pov, setPov] = useState('me');

  const myPosRef = useRef(null);
  const lastSent = useRef(null);
  const arrivedSent = useRef(false);

  // ---- Derived state --------------------------------------------------------
  const status = meetup?.status;
  const iAmCreator = !!meetup && meetup.created_by === user?.id;
  const friendId = meetup && user ? (iAmCreator ? meetup.invitee : meetup.created_by) : null;
  const friend = profiles[friendId];
  const friendName = displayName(friend);
  const friendLoc = friendId ? locs[friendId] : null;
  const sharing = status === 'planning' || status === 'live';
  const dest =
    status === 'live' && meetup.dest_lat != null
      ? { lat: meetup.dest_lat, lng: meetup.dest_lng, name: meetup.dest_name }
      : null;
  const proposal =
    status === 'planning' && meetup.proposal_lat != null
      ? { lat: meetup.proposal_lat, lng: meetup.proposal_lng, name: meetup.proposal_name, by: meetup.proposed_by }
      : null;

  // ---- Load + realtime --------------------------------------------------------
  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from('meetups').select('*').eq('id', id).maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    if (!data) {
      setLoadError("This meetup doesn't exist, or it isn't one of yours.");
      return;
    }
    setMeetup(data);
    const { data: rows } = await supabase.from('live_locations').select('*').eq('meetup_id', id);
    setLocs(Object.fromEntries((rows || []).map((r) => [r.user_id, r])));
  }, [supabase, user, id]);

  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    load();
    const channel = supabase
      .channel(`meet-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetups', filter: `id=eq.${id}` }, (p) =>
        setMeetup(p.new)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_locations', filter: `meetup_id=eq.${id}` },
        (p) => {
          if (p.eventType === 'DELETE') load();
          else setLocs((cur) => ({ ...cur, [p.new.user_id]: p.new }));
        }
      )
      .subscribe();
    // Safety net in case the realtime socket drops (flaky mobile data).
    const poll = setInterval(load, 20000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, user, supabase, id, load]);

  useEffect(() => {
    if (!meetup) return;
    fetchProfiles([meetup.created_by, meetup.invitee]).then(setProfiles);
  }, [meetup?.created_by, meetup?.invitee]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setNative(isNativeApp()), []);

  // ---- My location: watch while sharing, push to the friend ------------------
  // The background watcher only reports after 15 m of movement, so a standing
  // user could get no fix at all; the regular watcher covers the foreground.
  useEffect(() => {
    if (!sharing || !isNativeApp() || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        myPosRef.current = p;
        setMyPos(p);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sharing, geoAttempt]);

  useEffect(() => {
    if (!sharing) return;
    // In the Android app a foreground service keeps GPS running with the screen off.
    if (isNativeApp()) {
      let alive = true;
      let plugin = null;
      let watcherId = null;
      getBackgroundGeolocation()
        .then((bg) => {
          plugin = bg;
          return bg.addWatcher(
            {
              backgroundTitle: 'Halfway is sharing your location',
              backgroundMessage: `With ${friendName} for this meetup`,
              requestPermissions: true,
              stale: false,
              distanceFilter: 15,
            },
            (location, error) => {
              if (!alive) return;
              if (error) {
                setGeoError(
                  error.code === 'NOT_AUTHORIZED'
                    ? `Location is turned off for Halfway, so ${friendName} can't see you. Tap Open settings, allow Location, then tap Try again.`
                    : 'Having trouble getting your location — still trying…'
                );
                return;
              }
              if (!location) return;
              const p = { lat: location.latitude, lng: location.longitude, accuracy: location.accuracy };
              myPosRef.current = p;
              setMyPos(p);
              setGeoError(null);
            }
          );
        })
        .then((wid) => {
          watcherId = wid;
          if (!alive) plugin.removeWatcher({ id: wid }).catch(() => {});
        })
        .catch(() => alive && setGeoError("Couldn't start location sharing. Tap Try again."));
      return () => {
        alive = false;
        if (watcherId) plugin.removeWatcher({ id: watcherId }).catch(() => {});
      };
    }
    if (!navigator.geolocation) {
      setGeoError("This device can't share its location.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        myPosRef.current = p;
        setMyPos(p);
        setGeoError(null);
      },
      (err) =>
        setGeoError(
          err.code === 1
            ? `Location is turned off for Halfway, so ${friendName} can't see you. Allow location access and reload.`
            : 'Having trouble getting your location — still trying…'
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sharing, friendName, geoAttempt]);

  const myDistKm = dest && myPos ? haversine([myPos.lat, myPos.lng], [dest.lat, dest.lng]) : null;
  // Road routes to the meeting place for both people, re-routed when either strays.
  const myNav = useLiveRoute(status === 'live' ? myPos : null, dest);
  const friendNav = useLiveRoute(status === 'live' ? friendLoc : null, dest, {
    offRouteM: 150,
    minGapMs: 30000,
  });
  const myEtaMin = myNav.progress?.etaMin ?? null;

  const sendLocation = useCallback(
    async (force) => {
      const p = myPosRef.current;
      if (!p || !sharing || !supabase || !user) return;
      const t = Date.now();
      const last = lastSent.current;
      if (!force && last) {
        const moved = haversine([last.lat, last.lng], [p.lat, p.lng]);
        if (t - last.t < MIN_SEND_MS || (moved < MIN_MOVE_KM && t - last.t < HEARTBEAT_MS)) return;
      }
      lastSent.current = { t, lat: p.lat, lng: p.lng };
      const row = {
        meetup_id: id,
        user_id: user.id,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy,
        dist_km: myDistKm,
        eta_min: myEtaMin,
        updated_at: new Date().toISOString(),
      };
      if (isNativeApp()) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          await nativeUpsert({
            accessToken: session.access_token,
            table: 'live_locations',
            onConflict: 'meetup_id,user_id',
            row,
          });
        } catch {
          lastSent.current = null;
        }
        return;
      }
      const { error } = await supabase.from('live_locations').upsert(row);
      if (error) lastSent.current = null;
    },
    [sharing, supabase, user, id, myDistKm, myEtaMin]
  );

  useEffect(() => {
    if (myPos) sendLocation(false);
  }, [myPos, sendLocation]);

  // Standing still produces no GPS events — heartbeat so "updated" stays fresh.
  useEffect(() => {
    if (!sharing) return;
    const t = setInterval(() => sendLocation(true), HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [sharing, sendLocation]);

  // ---- Planning: fair halfway point between the two live positions -----------
  const creatorLoc = meetup ? locs[meetup.created_by] : null;
  const inviteeLoc = meetup ? locs[meetup.invitee] : null;
  // Rounded to ~1 km so both phones compute the same point and GPS jitter
  // doesn't re-run the search.
  const basisKey =
    status === 'planning' && creatorLoc && inviteeLoc
      ? [creatorLoc.lat, creatorLoc.lng, inviteeLoc.lat, inviteeLoc.lng].map((v) => v.toFixed(2)).join(',')
      : null;

  useEffect(() => {
    if (!basisKey) return;
    const [aLat, aLng, bLat, bLng] = basisKey.split(',').map(Number);
    const A = [aLat, aLng];
    const B = [bLat, bLng];
    const straight = [(aLat + bLat) / 2, (aLng + bLng) / 2];
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      let point = straight;
      if (haversine(A, B) > 0.5) {
        try {
          const r = await fetch(`/api/route?from=${A.join(',')}&to=${B.join(',')}`, { signal }).then((x) => x.json());
          if (r.routes?.[0]) point = pointAtFraction(r.routes[0].coords, 0.5).point;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      let hub = null;
      try {
        const h = await fetch(`/api/hubs?lat=${point[0]}&lng=${point[1]}&maxKm=15`, { signal }).then((x) => x.json());
        hub = h.hubs?.[0] || null;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
      setHalfway({ point, hub });
    })();

    return () => controller.abort();
  }, [basisKey]);

  const center = halfway ? (halfway.hub ? [halfway.hub.lat, halfway.hub.lng] : halfway.point) : null;
  const catsKey = cats.join(',');

  useEffect(() => {
    if (status !== 'planning' || !center) return;
    if (!cats.length) {
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    setPlacesLoading(true);
    fetch(`/api/places?lat=${center[0]}&lng=${center[1]}&radiusKm=3&categories=${catsKey}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => setPlaces((d.places || []).slice(0, 25)))
      .catch((err) => {
        if (err.name !== 'AbortError') setPlaces([]);
      })
      .finally(() => setPlacesLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, center?.[0], center?.[1], catsKey]);

  useEffect(() => {
    if (status !== 'live') setNavMode(false);
  }, [status]);

  // ---- Arrival: tell the friend once ------------------------------------------
  useEffect(() => {
    if (status !== 'live' || myDistKm == null || myDistKm > ARRIVE_KM || arrivedSent.current) return;
    arrivedSent.current = true;
    const key = `halfway-arrived-${id}`;
    let already = false;
    try {
      already = !!localStorage.getItem(key);
      localStorage.setItem(key, '1');
    } catch {}
    if (!already) sendLocation(true).then(() => notify('arrived', id));
  }, [status, myDistKm, id, sendLocation]);

  // ---- Keep the screen awake while travelling (web apps pause GPS when hidden) --
  useEffect(() => {
    if (status !== 'live' || !('wakeLock' in navigator) || isNativeApp()) return;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {}
    };
    acquire();
    const onVisible = () => !cancelled && document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [status]);

  // ---- Actions ----------------------------------------------------------------
  const update = async (patch, guard) => {
    let q = supabase.from('meetups').update(patch).eq('id', id);
    for (const [k, v] of Object.entries(guard)) q = v === null ? q.is(k, null) : q.eq(k, v);
    const { data, error } = await q.select().maybeSingle();
    if (error) throw error;
    if (!data) {
      await load();
      throw new Error(`${friendName} changed something at the same moment — here's the latest. Try again.`);
    }
    setMeetup(data);
    return data;
  };

  const run = (fn) => async () => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 6000);
    return () => clearTimeout(t);
  }, [actionError]);

  // A user tap lets the browser show the location prompt again.
  const retryLocation = () => {
    setGeoError(null);
    if (isNativeApp()) {
      setGeoAttempt((n) => n + 1);
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        myPosRef.current = p;
        setMyPos(p);
        sendLocation(true);
      },
      (err) =>
        setGeoError(
          err.code === 1
            ? 'Location is still blocked. Open your browser’s site settings for Halfway, allow Location, then tap Try again — or type where you are below.'
            : 'Couldn’t get a GPS fix. Try again outdoors, or type where you are below.'
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const openLocationSettings = () =>
    getBackgroundGeolocation()
      .then((bg) => bg.openSettings())
      .catch(() => {});

  const setManualLocation = (place) => {
    if (!place) return;
    const p = { lat: place.lat, lng: place.lng, accuracy: null };
    myPosRef.current = p;
    setMyPos(p);
    setGeoError(null);
    lastSent.current = null;
    sendLocation(true);
  };

  const CLEAR_PROPOSAL = { proposal_name: null, proposal_lat: null, proposal_lng: null, proposed_by: null };

  const acceptRequest = run(async () => {
    await update({ status: 'planning' }, { status: 'requested' });
    notify('meet_accepted', id);
  });
  const declineRequest = run(async () => {
    await update({ status: 'declined' }, { status: 'requested' });
    notify('meet_declined', id);
  });
  const cancelRequest = run(async () => {
    await update({ status: 'cancelled' }, { status: 'requested' });
    notify('meet_cancelled', id);
  });
  const propose = (place) =>
    run(async () => {
      await update(
        { proposal_name: place.name, proposal_lat: place.lat, proposal_lng: place.lng, proposed_by: user.id },
        { status: 'planning' }
      );
      setDroppedPin(null);
      setSelectedPlaceId(null);
      notify('place_proposed', id);
    })();
  const withdrawProposal = run(async () => {
    await update(CLEAR_PROPOSAL, { status: 'planning', proposed_by: user.id });
  });
  const acceptProposal = run(async () => {
    await update(
      {
        status: 'live',
        dest_name: meetup.proposal_name,
        dest_lat: meetup.proposal_lat,
        dest_lng: meetup.proposal_lng,
        ...CLEAR_PROPOSAL,
      },
      // Compare by name, not coordinates: float equality through the API isn't reliable.
      { status: 'planning', proposed_by: friendId, proposal_name: meetup.proposal_name }
    );
    notify('place_agreed', id);
  });
  const rejectProposal = run(async () => {
    await update(CLEAR_PROPOSAL, { status: 'planning', proposed_by: friendId });
    notify('place_rejected', id);
  });
  const endMeetup = run(async () => {
    if (!window.confirm('End this meetup and stop sharing your location?')) return;
    await update({ status: 'ended' }, { status });
    notify('meet_ended', id);
  });

  // ---- Render -------------------------------------------------------------------
  if (!supabase) {
    return <Centered title="Meetups aren't set up yet" text="Accounts need to be configured first." />;
  }
  if (authLoading || (user && !meetup && !loadError)) {
    return <Centered title="Loading meetup…" />;
  }
  if (!user) {
    return (
      <Centered title="Open Halfway on the phone you set up" text="Meetups are private to the two people in them. If this is a new phone, pick a username first and ask your friend to send a new meetup.">
        <Link href="/friends" className={s.primary}>Go to Friends</Link>
      </Centered>
    );
  }
  if (loadError) {
    return (
      <Centered title="Can't open this meetup" text={loadError}>
        <Link href="/friends" className={s.secondary}>Back to friends</Link>
      </Centered>
    );
  }

  if (status === 'requested') {
    return iAmCreator ? (
      <Centered
        avatar={initialOf(friend)}
        pulse
        title={`Waiting for ${friendName}…`}
        text="They've been notified. Once they accept, you'll both see each other's location and can pick a place."
      >
        {actionError && <p className={s.error}>{actionError}</p>}
        <NotificationToggle />
        <button type="button" className={s.danger} onClick={cancelRequest} disabled={busy}>
          Cancel request
        </button>
      </Centered>
    ) : (
      <Centered
        avatar={initialOf(friend)}
        title={`${friendName} wants to meet up`}
        text="If you accept, you'll both share your live location for this meetup only, and pick a place halfway together."
      >
        {actionError && <p className={s.error}>{actionError}</p>}
        <div className={s.actions} style={{ width: '100%' }}>
          <button type="button" className={s.primary} onClick={acceptRequest} disabled={busy}>
            Accept & share location
          </button>
          <button type="button" className={s.secondary} onClick={declineRequest} disabled={busy}>
            Decline
          </button>
        </div>
      </Centered>
    );
  }

  if (status === 'declined' || status === 'cancelled' || status === 'ended') {
    const text =
      status === 'declined'
        ? iAmCreator
          ? `${friendName} couldn't meet this time.`
          : 'You declined this meetup.'
        : status === 'cancelled'
          ? 'This meetup request was cancelled.'
          : 'This meetup has ended. Location sharing is off.';
    return (
      <Centered title={status === 'ended' ? 'Meetup ended' : 'No meetup'} text={text}>
        <Link href="/friends" className={s.primary}>Back to friends</Link>
      </Centered>
    );
  }

  // planning / live
  const selectedPlace = places?.find((p) => p.id === selectedPlaceId) || null;
  const friendDistKm =
    dest && friendLoc ? haversine([friendLoc.lat, friendLoc.lng], [dest.lat, dest.lng]) : null;
  const friendArrived = friendDistKm != null && friendDistKm <= ARRIVE_KM;
  const iArrived = myDistKm != null && myDistKm <= ARRIVE_KM;
  const fitKey = [!!myPos, !!friendLoc, dest?.lat, proposal?.lat, halfway?.point?.[0], recenter, navMode].join('|');

  const navigating = navMode && status === 'live' && !!dest;
  const viewing = pov === 'friend' && friendLoc ? 'friend' : 'me';

  return (
    <div className={`${s.meet} ${navigating ? s.meetNav : ''}`}>
      <aside className={s.meetPanel}>
        <div className={s.topBar}>
          <Link href="/friends" className={s.back}>← Friends</Link>
          <span className={`${s.pill} ${status === 'live' ? s.pillLive : ''}`}>
            {status === 'live' ? 'Live' : 'Picking a place'}
          </span>
          <ThemeToggle />
        </div>

        <h1 className={s.meetTitle}>
          {status === 'live' ? `Meeting ${friendName}` : `Plan with ${friendName}`}
        </h1>

        {geoError && (
          <section className={s.card}>
            <p className={s.banner}>{geoError}</p>
            <div className={s.actions}>
              <button type="button" className={s.secondary} onClick={retryLocation}>
                Try again
              </button>
              {native && (
                <button type="button" className={s.secondary} onClick={openLocationSettings}>
                  Open settings
                </button>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <LocationInput label="Or type where you are" marker="a" value={null} onSelect={setManualLocation} />
            </div>
          </section>
        )}
        {actionError && <p className={s.error}>{actionError}</p>}

        {status === 'planning' && (
          <>
            {!friendLoc && (
              <p className={s.banner}>
                Waiting for {friendName}&apos;s location. If it doesn&apos;t appear, ask them to open this
                meetup and allow location access when their phone asks.
              </p>
            )}

            {proposal && (
              <section className={`${s.card} ${s.proposal}`}>
                <h2 className={s.cardTitle}>
                  {proposal.by === user.id ? 'You suggested' : `${friendName} suggested`}
                </h2>
                <p className={s.proposalName}>{proposal.name}</p>
                {myPos && (
                  <p className={s.hint}>
                    {fmtKm(haversine([myPos.lat, myPos.lng], [proposal.lat, proposal.lng]))} from you
                    {friendLoc &&
                      ` · ${fmtKm(haversine([friendLoc.lat, friendLoc.lng], [proposal.lat, proposal.lng]))} from ${friendName}`}
                  </p>
                )}
                {proposal.by === user.id ? (
                  <>
                    <p className={s.hint}>Waiting for {friendName} to accept…</p>
                    <div className={s.actions}>
                      <button type="button" className={s.secondary} onClick={withdrawProposal} disabled={busy}>
                        Withdraw
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={s.actions}>
                    <button type="button" className={s.primary} onClick={acceptProposal} disabled={busy}>
                      Accept & start
                    </button>
                    <button type="button" className={s.secondary} onClick={rejectProposal} disabled={busy}>
                      Decline
                    </button>
                  </div>
                )}
              </section>
            )}

            {droppedPin && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>Pinned spot</h2>
                <div className={s.actions} style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className={s.primary}
                    disabled={busy}
                    onClick={() => propose({ name: 'Pinned spot', lat: droppedPin.lat, lng: droppedPin.lng })}
                  >
                    Suggest this spot
                  </button>
                  <button type="button" className={s.secondary} onClick={() => setDroppedPin(null)}>
                    Clear
                  </button>
                </div>
              </section>
            )}

            {selectedPlace && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>{categoryLabel(selectedPlace.category)}</h2>
                <p className={s.proposalName}>{selectedPlace.name}</p>
                <div className={s.actions}>
                  <button type="button" className={s.primary} disabled={busy} onClick={() => propose(selectedPlace)}>
                    Suggest this place
                  </button>
                </div>
              </section>
            )}

            {halfway && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>Fair halfway point</h2>
                <p className={s.proposalName}>{halfway.hub ? halfway.hub.name : 'The exact midpoint'}</p>
                <div className={s.actions}>
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={busy}
                    onClick={() =>
                      propose(
                        halfway.hub
                          ? { name: halfway.hub.name, lat: halfway.hub.lat, lng: halfway.hub.lng }
                          : { name: 'Halfway point', lat: halfway.point[0], lng: halfway.point[1] }
                      )
                    }
                  >
                    Suggest meeting here
                  </button>
                </div>
                <p className={s.hint}>Or pick a place below, or tap anywhere on the map to drop a pin.</p>
              </section>
            )}

            {halfway && (
              <section className={s.card}>
                <h2 className={s.cardTitle}>Places nearby</h2>
                <CategoryChips
                  selected={cats}
                  onToggle={(c) => setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}
                />
                <div style={{ marginTop: 10 }}>
                  {placesLoading && <p className={s.muted}>Finding places…</p>}
                  {!placesLoading && places?.length === 0 && (
                    <p className={s.muted}>Nothing in these categories nearby — try another.</p>
                  )}
                  {!placesLoading && places?.length > 0 && (
                    <ul className={s.places}>
                      {places.map((p) => (
                        <li
                          key={p.id}
                          className={`${s.placeRow} ${p.id === selectedPlaceId ? s.placeRowActive : ''}`}
                        >
                          <span className={s.dot} style={{ background: CATEGORY_COLORS[p.category] }} />
                          <button type="button" className={s.placeMain} onClick={() => setSelectedPlaceId(p.id)}>
                            <div className={s.placeName}>{p.name}</div>
                            <div className={s.placeMeta}>
                              {categoryLabel(p.category)}
                              {p.distanceKm != null && ` · ${fmtKm(p.distanceKm)} from centre`}
                            </div>
                          </button>
                          <button
                            type="button"
                            className={`${s.secondary} ${s.small}`}
                            disabled={busy}
                            onClick={() => propose(p)}
                          >
                            Suggest
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {status === 'live' && dest && (
          <>
            <section className={s.card}>
              <h2 className={s.cardTitle}>Meeting at</h2>
              <p className={s.proposalName}>{dest.name}</p>
              <div className={s.actions}>
                {navigating ? (
                  <button type="button" className={s.secondary} onClick={() => setNavMode(false)}>
                    Exit navigation
                  </button>
                ) : (
                  <button
                    type="button"
                    className={s.primary}
                    onClick={() => {
                      setPov('me');
                      setNavMode(true);
                    }}
                  >
                    Navigate
                  </button>
                )}
              </div>
              <div className={s.povSwitch} role="tablist" aria-label="Whose route to follow">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewing === 'me'}
                  className={viewing === 'me' ? s.povOn : s.pov}
                  onClick={() => setPov('me')}
                >
                  My route
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewing === 'friend'}
                  className={viewing === 'friend' ? s.povOn : s.pov}
                  onClick={() => setPov('friend')}
                  disabled={!friendLoc}
                >
                  {friendName}&apos;s location
                </button>
              </div>
            </section>

            <section className={s.card}>
              <div className={s.stat}>
                <div className={s.avatar}>{initialOf(profiles[user.id])}</div>
                <div className={s.statMain}>
                  <div className={s.personName}>You</div>
                  <div className={s.personSub}>
                    {iArrived ? <span className={s.arrived}>Arrived</span> : myEtaMin != null ? `~${fmtMin(myEtaMin)} by road` : 'Locating…'}
                  </div>
                </div>
                {myDistKm != null && (
                  <div className={s.statValue}>{fmtKm(myNav.progress?.remainingKm ?? myDistKm)}</div>
                )}
              </div>
              <div className={s.stat}>
                <div className={`${s.avatar} ${s.avatarAlt}`}>{initialOf(friend)}</div>
                <div className={s.statMain}>
                  <div className={s.personName}>{friendName}</div>
                  <div className={s.personSub}>
                    {friendArrived ? (
                      <span className={s.arrived}>Arrived</span>
                    ) : friendLoc ? (
                      <>
                        {(friendNav.progress?.etaMin ?? friendLoc.eta_min) != null &&
                          `~${fmtMin(friendNav.progress?.etaMin ?? friendLoc.eta_min)} · `}
                        updated {fmtAgo(friendLoc.updated_at, now)}
                      </>
                    ) : (
                      'Waiting for their location…'
                    )}
                  </div>
                </div>
                {friendDistKm != null && (
                  <div className={s.statValue}>{fmtKm(friendNav.progress?.remainingKm ?? friendDistKm)}</div>
                )}
              </div>
            </section>

            <p className={s.hint}>
              {native
                ? 'Location keeps sharing in the background — you’ll see a Halfway notification while it’s on.'
                : 'Keep Halfway open on screen while you travel — phones pause location sharing for web apps running in the background.'}
            </p>
          </>
        )}

        <NotificationToggle />

        <button type="button" className={`${s.danger} ${s.block}`} onClick={endMeetup} disabled={busy}>
          {status === 'live' ? 'End meetup' : 'Cancel meetup'}
        </button>
      </aside>

      <div className={s.meetMap}>
        {navigating ? (
          <>
            <NavigationMap
              focus={myPos}
              overview={viewing === 'friend'}
              bearing={myNav.progress?.bearing ?? 0}
              route={myNav.nav?.coords}
              me={myPos}
              meLetter={initialOf(profiles[user.id])}
              friend={friendLoc}
              friendLetter={initialOf(friend)}
              dest={dest}
            />
            {viewing === 'friend' ? (
              <FriendSpot name={friendName} me={myPos} friend={friendLoc} now={now} />
            ) : (
              <NavBanner who="You" isMe pos={myPos} live={myNav} arrived={iArrived} />
            )}
          </>
        ) : (
          <MeetMap
            me={myPos}
            meLetter={initialOf(profiles[user.id])}
            friend={friendLoc}
            friendLetter={initialOf(friend)}
            friendName={friendName}
            midpoint={status === 'planning' ? halfway?.point : null}
            places={status === 'planning' ? places : null}
            selectedPlaceId={selectedPlaceId}
            onPlaceSelect={setSelectedPlaceId}
            proposal={proposal}
            dest={dest}
            route={status === 'live' ? myNav.nav?.coords : null}
            altRoute={status === 'live' ? friendNav.nav?.coords : null}
            droppedPin={droppedPin}
            onMapClick={status === 'planning' && !proposal ? setDroppedPin : null}
            fitKey={fitKey}
            panTarget={selectedPlace}
          />
        )}

        {navigating ? (
          <button
            type="button"
            className={s.recenter}
            onClick={() => setPov(viewing === 'me' && friendLoc ? 'friend' : 'me')}
            disabled={!friendLoc}
          >
            {viewing === 'me' ? `See ${friendName}` : 'Back to my route'}
          </button>
        ) : (
          <button type="button" className={s.recenter} onClick={() => setRecenter((n) => n + 1)}>
            Show everyone
          </button>
        )}
      </div>
    </div>
  );
}

function Centered({ title, text, avatar, pulse, children }) {
  return (
    <div className={s.page}>
      <div className={s.topBar} style={{ maxWidth: 440, margin: '0 auto' }}>
        <Link href="/friends" className={s.back}>← Friends</Link>
        <ThemeToggle />
      </div>
      <div className={`${s.card} ${s.centerCard}`}>
        {avatar && (
          <div className={`${s.avatar} ${s.avatarAlt} ${s.bigAvatar} ${pulse ? s.pulseRing : ''}`}>{avatar}</div>
        )}
        <h1 className={s.meetTitle}>{title}</h1>
        {text && <p className={s.muted} style={{ marginTop: 8 }}>{text}</p>}
        {children && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18, alignItems: 'stretch' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
