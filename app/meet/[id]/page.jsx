'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import NotificationToggle from '@/components/NotificationToggle';
import ThemeToggle from '@/components/ThemeToggle';
import LocationInput from '@/components/LocationInput';
import { getSupabase } from '@/lib/supabase';
import { isNativeApp, getBackgroundGeolocation, nativeUpsert } from '@/lib/native';
import { notify } from '@/lib/notify';
import { fetchProfiles, displayName, initialOf } from '@/lib/social';
import { haversine, pointAtFraction, fairCenter } from '@/lib/geo';
import { useLiveRoute, fmtKm, fmtMin } from '@/lib/navigation';
import { sendGapMs, withSpeed, fmtSpeed, acceptFix, isArrived, myLocationStatus, PROBE_AFTER_MS } from '@/lib/liveTracking';
import { rememberPosition } from '@/lib/localPlaces';
import NavBanner from '@/components/NavBanner';
import FriendSpot from '@/components/FriendSpot';
import FairSpots from '@/components/meet/FairSpots';
import AddPeople from '@/components/meet/AddPeople';
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
import { ArrowLeft, PinIcon } from '@/components/meet/icons';
import s from '@/components/Social.module.css';
import m from '@/components/meet/Meet.module.css';

const MeetMap = dynamic(() => import('@/components/MeetMap'), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Loading map…</div>,
});
const NavigationMap = dynamic(() => import('@/components/NavigationMap'), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Starting navigation…</div>,
});

const ARRIVE_KM = 0.15;
const ALMOST_KM = 0.5; // "almost there" alert: this close to the place…
const ALMOST_MIN = 5; // …or this many minutes away
const HEARTBEAT_MS = 30000;
// Worse than this (metres) is a Wi-Fi / internet guess, not a GPS fix.
const ROUGH_M = 200;
const MIN_MOVE_KM = 0.01;
const STALE_MS = 2 * 60 * 1000;

function fmtAgo(iso, now) {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 3) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min ago` : 'over an hour ago';
}

// "A", "A and B", "A, B and C".
function listNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Errors from a database function that isn't installed yet (group SQL not run).
const missingFn = (error) => error?.code === 'PGRST202' || error?.code === '42883';

export default function MeetPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const supabase = getSupabase();

  const [meetup, setMeetup] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [locs, setLocs] = useState({});
  // Group meetups: people added after it started (invited / joined / declined / left).
  const [members, setMembers] = useState([]);
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
  const [followKey, setFollowKey] = useState(0);
  const [navMode, setNavMode] = useState(false);
  const [pov, setPov] = useState('me');
  // "Where's my friend?": re-read their latest spot, then zoom the map onto it.
  const [findingId, setFindingId] = useState(null);
  const [friendFocus, setFriendFocus] = useState(null);

  const layout = useSheetLayout();
  const myPosRef = useRef(null);
  const pendingFixRef = useRef(null); // a suspicious jump waiting for a second reading
  const arrivedRef = useRef({}); // who has arrived (kept while they walk around the entrance)
  // True after "type where you are": GPS mustn't move the typed spot.
  const manualRef = useRef(false);
  const [manual, setManual] = useState(false);
  const lastSent = useRef(null);
  const arrivedSent = useRef(false);
  const almostSent = useRef(false);
  const wasFar = useRef(false);

  // ---- Derived state --------------------------------------------------------
  const status = meetup?.status;
  const iAmCreator = !!meetup && meetup.created_by === user?.id;
  // The "friend" is the other person who started it (or, for someone added
  // later, whoever created it); everyone else in a group is in extraIds.
  const friendId = meetup && user ? (iAmCreator ? meetup.invitee : meetup.created_by) : null;
  const friend = profiles[friendId];
  const friendName = displayName(friend);
  const friendLoc = friendId ? locs[friendId] : null;
  const iAmOriginal = !!meetup && !!user && (meetup.created_by === user.id || meetup.invitee === user.id);
  const myMember = members.find((r) => r.user_id === user?.id) || null;
  const joinedIds = members.filter((r) => r.status === 'joined').map((r) => r.user_id);
  const invitedIds = members.filter((r) => r.status === 'invited').map((r) => r.user_id);
  const peopleIds = meetup ? [...new Set([meetup.created_by, meetup.invitee, ...joinedIds])] : [];
  const extraIds = peopleIds.filter((p) => p !== user?.id && p !== friendId);
  const isGroup = peopleIds.length > 2;
  const iAmIn = iAmOriginal || myMember?.status === 'joined';
  const sharing = (status === 'planning' || status === 'live') && iAmIn;
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
    const [{ data: rows }, { data: memberRows }] = await Promise.all([
      supabase.from('live_locations').select('*').eq('meetup_id', id),
      // Errors (e.g. the group-meetups SQL not run yet) just mean no extra people.
      supabase.from('meetup_members').select('*').eq('meetup_id', id),
    ]);
    setMembers(memberRows || []);
    setLocs((cur) => Object.fromEntries((rows || []).map((r) => [r.user_id, withSpeed(cur[r.user_id], r)])));
    return rows || [];
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
          else setLocs((cur) => ({ ...cur, [p.new.user_id]: withSpeed(cur[p.new.user_id], p.new) }));
        }
      )
      .subscribe();
    const membersChannel = supabase
      .channel(`meet-members-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_members', filter: `meetup_id=eq.${id}` }, () =>
        load()
      )
      .subscribe();
    // Safety net in case the realtime socket drops (flaky mobile data).
    const poll = setInterval(load, 20000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(membersChannel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, user, supabase, id, load]);

  const profileKey = meetup ? [meetup.created_by, meetup.invitee, ...members.map((r) => r.user_id)].join(',') : '';
  useEffect(() => {
    if (!profileKey) return;
    fetchProfiles(profileKey.split(',')).then(setProfiles);
  }, [profileKey]);

  // Ticks every second while sharing so "updated 4s ago" stays honest.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), sharing ? 1000 : 5000);
    return () => clearInterval(t);
  }, [sharing]);

  useEffect(() => setNative(isNativeApp()), []);

  // ---- My location: watch while sharing, push to the friend ------------------
  // Phones often report a rough Wi-Fi/network guess first (or in between GPS
  // fixes). Never let one of those replace a good fix from the last minute.
  // A wild jump (a km away in seconds) waits for a second reading to agree.
  const takeFix = useCallback((p) => {
    if (manualRef.current) return;
    const { fix, pending } = acceptFix(myPosRef.current, pendingFixRef.current, p, Date.now());
    pendingFixRef.current = pending;
    if (!fix) return;
    if (!(p.accuracy > ROUGH_M)) rememberPosition(p.lat, p.lng);
    myPosRef.current = fix;
    setMyPos(fix);
  }, []);

  // The background watcher only reports after 15 m of movement, so a standing
  // user could get no fix at all; the regular watcher covers the foreground.
  useEffect(() => {
    if (!sharing || !isNativeApp() || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        takeFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
        });
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
              distanceFilter: 5,
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
              takeFix({
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy,
                speed: location.speed,
              });
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
        takeFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
        });
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

  // Standing still (red light, waiting at the place) the GPS sends nothing new,
  // which isn't a fault. On screen, ask for a fresh reading every 30 s so the
  // "isn't updating" warning only shows when the phone really can't get one.
  useEffect(() => {
    if (!sharing || !navigator.geolocation) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || manualRef.current) return;
      const cur = myPosRef.current;
      if (cur && Date.now() - cur.at < PROBE_AFTER_MS) return;
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          takeFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
          }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    }, 15000);
    return () => clearInterval(t);
  }, [sharing, takeFix]);

  const roughMe = !manual && myPos?.accuracy > ROUGH_M;
  const roughFriend = friendLoc?.accuracy > ROUGH_M;
  const myDistKm = dest && myPos ? haversine([myPos.lat, myPos.lng], [dest.lat, dest.lng]) : null;
  // Arrived, allowing for GPS error; remembered per person and place.
  const arrivedFor = (who, distKm, accuracyM) => {
    const key = `${who}@${dest?.lat},${dest?.lng}`;
    const v = isArrived(arrivedRef.current[key], distKm, accuracyM);
    arrivedRef.current[key] = v;
    return v;
  };
  const myArrived = arrivedFor('me', myDistKm, myPos?.accuracy);
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
        // The GPS's own speed when it has one, else worked out since the last upload.
        const speed = Number.isFinite(p.speed) && p.speed >= 0 ? p.speed : (moved * 1e6) / Math.max(1, t - last.t);
        if (t - last.t < sendGapMs(speed) || (moved < MIN_MOVE_KM && t - last.t < HEARTBEAT_MS)) return;
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
  // Everyone who's sharing, in a fixed order. Rounded to ~1 km so every phone
  // computes the same point and GPS jitter doesn't re-run the search.
  const basisLocs = peopleIds.map((p) => locs[p]).filter(Boolean);
  const basisKey =
    status === 'planning' && basisLocs.length >= 2
      ? basisLocs.map((l) => `${l.lat.toFixed(2)},${l.lng.toFixed(2)}`).join(';')
      : null;

  useEffect(() => {
    if (!basisKey) return;
    const pts = basisKey.split(';').map((p) => p.split(',').map(Number));
    const [A, B] = pts;
    // Two people: halfway along the road between them. A group: the spot that
    // keeps the longest trip as short as possible.
    const straight = pts.length === 2 ? [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2] : fairCenter(pts);
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      let point = straight;
      if (pts.length === 2 && haversine(A, B) > 0.5) {
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

  // Until the friend shares, show spots near me; then spots near halfway.
  // Rounded (~100 m) so small moves of my live position don't refetch.
  const nearMe = !friendLoc && myPos ? [+myPos.lat.toFixed(3), +myPos.lng.toFixed(3)] : null;
  const center = halfway ? (halfway.hub ? [halfway.hub.lat, halfway.hub.lng] : halfway.point) : nearMe;
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

  // ---- Almost there: tell the others once, ~5 min or ~500 m out ----------------
  // Only after having been properly away, so starting next door doesn't send it.
  useEffect(() => {
    if (status !== 'live' || myDistKm == null || almostSent.current) return;
    if (myDistKm > ALMOST_KM * 2) wasFar.current = true;
    const close = myDistKm <= ALMOST_KM || (myEtaMin != null && myEtaMin <= ALMOST_MIN);
    if (!wasFar.current || !close || myArrived) return;
    almostSent.current = true;
    const key = `halfway-almost-${id}`;
    let already = false;
    try {
      already = !!localStorage.getItem(key);
      localStorage.setItem(key, '1');
    } catch {}
    if (!already) sendLocation(true).then(() => notify('almost_there', id));
  }, [status, myDistKm, myEtaMin, myArrived, id, sendLocation]);

  // ---- Arrival: tell the friend once ------------------------------------------
  useEffect(() => {
    if (status !== 'live' || !myArrived || arrivedSent.current) return;
    arrivedSent.current = true;
    const key = `halfway-arrived-${id}`;
    let already = false;
    try {
      already = !!localStorage.getItem(key);
      localStorage.setItem(key, '1');
    } catch {}
    if (!already) sendLocation(true).then(() => notify('arrived', id));
  }, [status, myArrived, id, sendLocation]);

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
    // A stalled mobile connection used to leave this hanging forever, with every
    // button disabled. Give up after 15 s so the person can simply tap again.
    const { data, error } = await q.select().abortSignal(AbortSignal.timeout(15000)).maybeSingle();
    if (error) {
      if (/abort|timeout/i.test(`${error.name} ${error.message}`)) {
        throw new Error('Your connection is slow right now and that didn’t go through. Tap it again.');
      }
      throw error;
    }
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
    manualRef.current = false;
    setManual(false);
    myPosRef.current = null;
    if (isNativeApp()) {
      setGeoAttempt((n) => n + 1);
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        takeFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
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
    const p = { lat: place.lat, lng: place.lng, accuracy: null, at: Date.now() };
    manualRef.current = true;
    setManual(true);
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
    // Everyone has to accept in a group; the database starts it when the last one does.
    const { data: started, error } = await supabase.rpc('accept_proposal', { m: id, pname: meetup.proposal_name });
    if (!error) {
      if (started) notify('place_agreed', id);
      await load();
      return;
    }
    if (!missingFn(error)) {
      load();
      throw new Error(error.message);
    }
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
    await update(CLEAR_PROPOSAL, { status: 'planning', proposal_name: meetup.proposal_name });
    notify('place_rejected', id);
  });
  const endMeetup = run(async () => {
    const ask = isGroup
      ? 'End this meetup for everyone and stop sharing locations?'
      : 'End this meetup and stop sharing your location?';
    if (!window.confirm(ask)) return;
    await update({ status: 'ended' }, { status });
    notify('meet_ended', id);
  });
  // People who were added later can leave without ending it for everyone.
  const leaveMeetup = run(async () => {
    if (!window.confirm('Leave this meetup? Your location stops sharing.')) return;
    const { error } = await supabase.rpc('leave_meetup', { m: id });
    if (error) throw new Error(error.message);
    notify('member_left', id);
    await load();
  });
  const respondInvite = (accept) =>
    run(async () => {
      const { error } = await supabase.rpc('respond_meetup_invite', { m: id, accept });
      if (error) throw new Error(error.message);
      if (accept) notify('member_joined', id);
      await load();
    })();
  const addPerson = async (uid) => {
    const { error } = await supabase.rpc('add_meetup_member', { m: id, friend: uid });
    if (error) {
      throw new Error(
        missingFn(error) ? 'Adding people needs a quick database update first (supabase-group-meetups.sql).' : error.message
      );
    }
    notify('member_invited', id, { to: uid });
    await load();
  };


  // ---- Render -------------------------------------------------------------------
  if (!supabase) {
    return <Centered title="Meetups aren't set up yet" text="Accounts need to be configured first." />;
  }
  if (authLoading || (user && !meetup && !loadError)) {
    return <Centered title="Loading meetup…" loading />;
  }
  if (!user) {
    return (
      <Centered title="Open Halfway on the phone you set up" text="Meetups are private to the people in them. If this is a new phone, pick a username first and ask your friend to send a new meetup.">
        <Link href="/friends" className={m.btn}>Go to Friends</Link>
      </Centered>
    );
  }
  if (loadError) {
    return (
      <Centered title="Can't open this meetup" text={loadError}>
        <Link href="/friends" className={m.btnGhost}>Back to friends</Link>
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
        <button type="button" className={m.btnDanger} onClick={cancelRequest} disabled={busy}>
          {busy ? 'Cancelling…' : 'Cancel request'}
        </button>
      </Centered>
    ) : (
      <Centered
        avatar={initialOf(friend)}
        title={`${friendName} wants to meet up`}
        text="If you accept, you'll both share your live location for this meetup only, and pick a place halfway together."
      >
        {actionError && <p className={s.error}>{actionError}</p>}
        <div className={m.row} style={{ marginTop: 0 }}>
          <button type="button" className={m.btn} onClick={acceptRequest} disabled={busy}>
            {busy ? 'Opening…' : 'Accept & share location'}
          </button>
          <button type="button" className={m.btnGhost} onClick={declineRequest} disabled={busy} style={{ flex: '0 0 auto' }}>
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
        <Link href="/friends" className={m.btn}>Back to friends</Link>
      </Centered>
    );
  }

  // Added to a group meetup by a friend: accept or decline first.
  if (!iAmOriginal && myMember?.status === 'invited') {
    const inviter = profiles[myMember.invited_by];
    const names = peopleIds.map((p) => displayName(profiles[p]));
    return (
      <Centered
        avatar={initialOf(inviter)}
        title={`${displayName(inviter)} added you to a meetup`}
        text={`With ${listNames(names)}${
          dest ? `, heading to ${dest.name}` : ''
        }. If you join, everyone sees your live location for this meetup only.`}
      >
        {actionError && <p className={s.error}>{actionError}</p>}
        <div className={m.row} style={{ marginTop: 0 }}>
          <button type="button" className={m.btn} onClick={() => respondInvite(true)} disabled={busy}>
            {busy ? 'Joining…' : 'Join & share location'}
          </button>
          <button
            type="button"
            className={m.btnGhost}
            onClick={() => respondInvite(false)}
            disabled={busy}
            style={{ flex: '0 0 auto' }}
          >
            Decline
          </button>
        </div>
      </Centered>
    );
  }
  if (!iAmIn) {
    return (
      <Centered
        title="You're not in this meetup"
        text={myMember?.status === 'left' ? 'You left this meetup. Location sharing is off.' : 'You declined this one.'}
      >
        <Link href="/friends" className={m.btn}>Back to friends</Link>
      </Centered>
    );
  }

  // planning / live
  const selectedPlace = places?.find((p) => p.id === selectedPlaceId) || null;
  const friendDistKm =
    dest && friendLoc ? haversine([friendLoc.lat, friendLoc.lng], [dest.lat, dest.lng]) : null;
  const friendArrived = arrivedFor(friendId, friendDistKm, friendLoc?.accuracy);
  const iArrived = myArrived;
  const extraLocCount = extraIds.filter((p) => locs[p]).length;
  const fitKey = [!!myPos, !!friendLoc, extraLocCount, dest?.lat, proposal?.lat, halfway?.point?.[0], recenter, navMode, layout.wide].join('|');

  const navigating = navMode && status === 'live' && !!dest;
  const viewing = pov === 'friend' && friendLoc ? 'friend' : 'me';
  const meProfile = profiles[user.id];
  const meLetter = initialOf(meProfile);
  const friendLetter = initialOf(friend);
  const friendEta = friendNav.progress?.etaMin ?? friendLoc?.eta_min ?? null;
  const friendAgo = friendLoc?.updated_at ? fmtAgo(friendLoc.updated_at, now) : null;
  // No upload for 2 min means their phone stopped sending (app closed, screen
  // off on the web, or battery saver) - the heartbeat alone sends every 30 s.
  const friendStale = !!friendLoc?.updated_at && now - new Date(friendLoc.updated_at).getTime() > STALE_MS;
  // Re-read the latest spots, then zoom onto one person ('all' = fit everyone).
  const findPerson = async (uid) => {
    if (findingId) return;
    setFindingId(uid);
    const started = Date.now();
    let rows = null;
    try {
      rows = await load();
    } catch {}
    // Keep the spinner up long enough to read as "checked".
    await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - started))));
    setFindingId(null);
    if (uid === 'all') {
      setRecenter((n) => n + 1);
      return;
    }
    const at = rows?.find((r) => r.user_id === uid) || locs[uid];
    if (at) setFriendFocus({ lat: at.lat, lng: at.lng, n: Date.now() });
  };
  const findFriend = () => findPerson(friendId);

  // Everyone else in a group: markers, list rows and the pill summary.
  const extras = extraIds.map((uid) => {
    const loc = locs[uid] || null;
    const profile = profiles[uid];
    const distKm = dest && loc ? haversine([loc.lat, loc.lng], [dest.lat, dest.lng]) : null;
    return {
      id: uid,
      loc,
      name: displayName(profile),
      letter: initialOf(profile),
      distKm,
      arrived: arrivedFor(uid, distKm, loc?.accuracy),
      etaMin: loc?.eta_min ?? null,
      ago: loc?.updated_at ? fmtAgo(loc.updated_at, now) : null,
      stale: !!loc?.updated_at && now - new Date(loc.updated_at).getTime() > STALE_MS,
    };
  });
  const othersOnMap = extras
    .filter((e) => e.loc)
    .map((e) => ({
      id: e.id,
      lat: e.loc.lat,
      lng: e.loc.lng,
      letter: e.letter,
      name: e.name,
      tag: status === 'live' ? (e.arrived ? 'Arrived' : e.etaMin != null ? fmtMin(e.etaMin) : null) : null,
      live: !e.stale,
    }));
  // Pins pulse while that person is sharing live; dim when their spot is out of date.
  const myLocState = myLocationStatus({ sharing, manual, pos: myPos, now });
  const meLive = sharing && myPos ? !myLocState : undefined;
  const friendLive = friendLoc ? !friendStale : undefined;
  // "My location": back to following me (navigation) or fly in on me (map).
  const locateMe = () => {
    if (!myPos) return;
    setPov('me');
    setFollowKey((n) => n + 1);
    setFriendFocus({ lat: myPos.lat, lng: myPos.lng, n: Date.now(), me: true });
  };
  const locText =
    myLocState?.kind === 'finding'
      ? 'Finding your location…'
      : myLocState?.kind === 'stale'
        ? `Your location isn’t updating (last fix ${myLocState.ageSec}s ago). Check GPS and signal.`
        : myLocState?.kind === 'rough'
          ? `Your location is approximate (±${fmtKm(myLocState.accuracyM / 1000)}), so your pin may be off.`
          : null;

  let pill = meetStatusPill({ status, friendName, friendLoc, friendArrived, friendEta, friendDistKm, friendNav, friendAgo, friendStale });
  if (isGroup) {
    const here = [iArrived, friendArrived, ...extras.map((e) => e.arrived)].filter(Boolean).length;
    pill = {
      label: status === 'live' ? 'Tracking live' : 'Picking a place',
      detail:
        status === 'live'
          ? here
            ? `${here} of ${peopleIds.length} there`
            : `${peopleIds.length} people on the way`
          : `${peopleIds.length} people`,
      ago: null,
      live: true,
    };
  }
  const { meTag, friendTag } = etaTags({ status, myPos, friendLoc, center, iArrived, friendArrived, myEtaMin, friendEta });
  const alert = proposal && proposal.by !== user.id ? `${friendName} suggested ${proposal.name}` : null;
  const shareHint = native
    ? 'Location keeps sharing in the background — you’ll see a Halfway notification while it’s on.'
    : 'Keep Halfway open on screen while you travel — phones pause location sharing for web apps running in the background.';
  // Group suggestions start once everyone (but whoever suggested it) accepts.
  const accepts = meetup.proposal_accepts || [];
  const waitingOn = proposal ? peopleIds.filter((p) => p !== proposal.by && !accepts.includes(p)) : [];
  const iAccepted = !!proposal && accepts.includes(user.id);
  const lastToAccept = waitingOn.length === 1 && waitingOn[0] === user.id;
  const waitingNames = listNames(waitingOn.filter((p) => p !== user.id).map((p) => displayName(profiles[p])));

  const startNav = () => {
    setPov('me');
    setNavMode(true);
  };

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
            meLetter={meLetter}
            friend={friendLoc}
            friendLetter={friendLetter}
            others={othersOnMap}
            dest={dest}
            focusOn={friendFocus?.me ? null : friendFocus}
            followKey={followKey}
            meLive={meLive}
            friendLive={friendLive}
          />
        ) : (
          <MeetMap
            me={myPos}
            meLetter={meLetter}
            friend={friendLoc}
            friendLetter={friendLetter}
            friendName={friendName}
            others={othersOnMap}
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
            focusOn={friendFocus}
            insets={layout.insets}
            meTag={meTag}
            friendTag={friendTag}
            meLive={meLive}
            friendLive={friendLive}
            link={
              status === 'planning' && halfway
                ? [myPos && [myPos.lat, myPos.lng], halfway.point, friendLoc && [friendLoc.lat, friendLoc.lng]]
                : null
            }
          />
        )}
      </div>

      <MeetHeader
        me={meProfile}
        letter={meLetter}
        alert={alert}
        menu={
          <>
            <NotificationToggle />
            <p className={m.hint}>{shareHint}</p>
          </>
        }
      >
        {navigating ? (
          <div className={m.bannerSlot}>
            {viewing === 'friend' ? (
              <FriendSpot name={friendName} me={myPos} friend={friendLoc} now={now} />
            ) : (
              <NavBanner who="You" isMe pos={myPos} live={myNav} arrived={iArrived} />
            )}
          </div>
        ) : (
          <StatusPill
            {...pill}
            onClick={isGroup ? () => findPerson('all') : friendLoc ? findFriend : null}
            busy={isGroup ? findingId === 'all' : findingId === friendId}
            friendName={isGroup ? 'everyone' : friendName}
          />
        )}
        {/* Always on screen (the sheet can be hidden while navigating). */}
        {sharing && (locText || geoError) && (
          <div className={`${m.locStrip} ${myLocState?.kind === 'finding' && !geoError ? m.locStripCalm : ''}`} role="status">
            <span>{geoError || locText}</span>
            {(geoError || myLocState?.kind !== 'finding') && (
              <button type="button" onClick={retryLocation}>
                Try again
              </button>
            )}
          </div>
        )}
      </MeetHeader>

      <MapControls
        lowered={sharing && !!(locText || geoError)}
        onLocate={myPos ? locateMe : null}
        navigating={navigating}
        onFit={() => setRecenter((n) => n + 1)}
        onNavigate={status === 'live' && dest ? startNav : null}
        onExitNav={() => setNavMode(false)}
        pill={
          navigating && (
            <button
              type="button"
              className={m.ctrlPill}
              onClick={() => setPov(viewing === 'me' && friendLoc ? 'friend' : 'me')}
              disabled={!friendLoc}
            >
              {viewing === 'me' ? `See ${friendName}` : 'Back to my route'}
            </button>
          )
        }
      />

      <aside ref={layout.sheetRef} className={m.sheet} aria-label={status === 'live' ? 'Meetup' : 'Pick a place'}>
        <div className={m.handle} aria-hidden="true" />

        {!geoError && manual && sharing && (
          <p className={m.hint}>
            Using the place you typed.{' '}
            <button type="button" className={s.linkBtn} onClick={retryLocation}>
              Use my GPS again
            </button>
          </p>
        )}
        {(geoError || (roughMe && sharing)) && (
          <section className={s.card}>
            <p className={s.banner}>
              {geoError ||
                `Your location is only accurate to about ${fmtKm(myPos.accuracy / 1000)}, so ${friendName} may see you in the wrong spot. ${
                  native
                    ? 'Turn on Location → Use precise location for Halfway, and make sure GPS is on.'
                    : 'Allow precise location, turn on GPS, or step near a window.'
                } Or type where you are.`}
            </p>
            <div className={m.row}>
              <button type="button" className={m.btnGhost} onClick={retryLocation}>
                Try again
              </button>
              {native && (
                <button type="button" className={m.btnGhost} onClick={openLocationSettings}>
                  Open settings
                </button>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <LocationInput label="Or type where you are" marker="a" value={null} onSelect={setManualLocation} />
            </div>
          </section>
        )}
        {actionError && (
          <p className={s.error} role="alert">
            {actionError}
          </p>
        )}

        {status === 'planning' && (
          <>
            {proposal && (
              <section className={m.proposal}>
                <span className={m.kicker}>{proposal.by === user.id ? 'You suggested' : `${friendName} suggested`}</span>
                <p className={m.proposalName}>{proposal.name}</p>
                {myPos && (
                  <p className={m.proposalMeta}>
                    {fmtKm(haversine([myPos.lat, myPos.lng], [proposal.lat, proposal.lng]))} from you
                    {friendLoc &&
                      ` · ${fmtKm(haversine([friendLoc.lat, friendLoc.lng], [proposal.lat, proposal.lng]))} from ${friendName}`}
                  </p>
                )}
                {proposal.by === user.id ? (
                  <>
                    <p className={m.proposalMeta}>Waiting for {waitingNames || friendName} to accept…</p>
                    <div className={m.row}>
                      <button type="button" className={m.btnGhost} onClick={withdrawProposal} disabled={busy}>
                        {busy ? 'Withdrawing…' : 'Withdraw'}
                      </button>
                    </div>
                  </>
                ) : iAccepted ? (
                  <p className={m.proposalMeta}>You accepted · waiting for {waitingNames} to accept…</p>
                ) : (
                  <div className={m.row}>
                    <button type="button" className={m.btn} onClick={acceptProposal} disabled={busy}>
                      {busy ? 'Saving…' : lastToAccept ? 'Accept & start' : 'Accept'}
                    </button>
                    <button type="button" className={m.btnGhost} onClick={rejectProposal} disabled={busy}>
                      Decline
                    </button>
                  </div>
                )}
              </section>
            )}

            {droppedPin && (
              <section className={m.spotRow}>
                <span className={m.spotIcon} aria-hidden="true">
                  <PinIcon />
                </span>
                <span className={m.spotText}>
                  <span className={m.kicker}>Pinned spot</span>
                  <span className={m.spotName}>Your dropped pin</span>
                </span>
                <button
                  type="button"
                  className={`${m.btn} ${m.btnSm}`}
                  disabled={busy}
                  onClick={() => propose({ name: 'Pinned spot', lat: droppedPin.lat, lng: droppedPin.lng })}
                >
                  {busy ? 'Sending…' : 'Suggest'}
                </button>
                <button
                  type="button"
                  className={`${m.btnGhost} ${m.btnSm}`}
                  onClick={() => setDroppedPin(null)}
                  aria-label="Clear pinned spot"
                >
                  Clear
                </button>
              </section>
            )}

            {!halfway && friendLoc && myPos && <p className={m.hint}>Finding the fair halfway point…</p>}

            {halfway && (
              <HalfwayRow
                name={halfway.hub ? halfway.hub.name : 'The exact midpoint'}
                busy={busy}
                onSuggest={() =>
                  propose(
                    halfway.hub
                      ? { name: halfway.hub.name, lat: halfway.hub.lat, lng: halfway.hub.lng }
                      : { name: 'Halfway point', lat: halfway.point[0], lng: halfway.point[1] }
                  )
                }
              />
            )}

            {(halfway || nearMe) && (
              <FairSpots
                title={halfway ? 'Fair spots near halfway' : 'Spots near you'}
                places={places}
                loading={placesLoading}
                cats={cats}
                onCats={setCats}
                me={myPos}
                friend={friendLoc}
                friendName={friendName}
                meLetter={meLetter}
                friendLetter={friendLetter}
                busy={busy}
                onPick={propose}
                selectedId={selectedPlaceId}
                onSelect={setSelectedPlaceId}
              />
            )}
          </>
        )}

        {status === 'live' && dest && (
          <>
            <DestCard
              name={dest.name}
              navigating={navigating}
              onNavigate={startNav}
              onExit={() => setNavMode(false)}
              viewing={viewing}
              onPov={setPov}
              friendName={friendName}
              friendKnown={!!friendLoc}
            />
            <PeopleList
              rows={[
                {
                  key: 'me',
                  me: true,
                  letter: meLetter,
                  name: 'You',
                  arrived: iArrived,
                  sub: myEtaMin != null ? `~${fmtMin(myEtaMin)} by road` : 'Locating…',
                  km: myDistKm != null ? myNav.progress?.remainingKm ?? myDistKm : null,
                },
                {
                  key: 'friend',
                  letter: friendLetter,
                  name: friendName,
                  arrived: friendArrived,
                  onFind: friendLoc ? findFriend : null,
                  finding: findingId === friendId,
                  sub: friendLoc ? (
                    <>
                      {friendEta != null && `~${fmtMin(friendEta)} · `}
                      {roughFriend && `approximate (±${fmtKm(friendLoc.accuracy / 1000)}) · `}
                      {fmtSpeed(friendLoc.speedKmh) && `${fmtSpeed(friendLoc.speedKmh)} · `}
                      {friendStale ? <span className={m.stale}>last seen {friendAgo}</span> : <>updated {friendAgo}</>}
                    </>
                  ) : (
                    'Waiting for their location…'
                  ),
                  km: friendDistKm != null ? friendNav.progress?.remainingKm ?? friendDistKm : null,
                },
                ...extras.map((e) => ({
                  key: e.id,
                  letter: e.letter,
                  name: e.name,
                  arrived: e.arrived,
                  sub: e.loc ? (
                    <>
                      {e.etaMin != null && `~${fmtMin(e.etaMin)} · `}
                      {e.stale ? <span className={m.stale}>last seen {e.ago}</span> : <>updated {e.ago}</>}
                    </>
                  ) : (
                    'Waiting for their location…'
                  ),
                  km: e.distKm,
                  onFind: e.loc ? () => findPerson(e.id) : null,
                  finding: findingId === e.id,
                })),
              ]}
            />
            {friendStale && !friendArrived && (
              <p className={m.hint}>
                {friendName}&apos;s phone stopped sending their location. Ask them to open Halfway and it picks up
                again straight away.
              </p>
            )}
            <p className={m.hint}>{shareHint}</p>
          </>
        )}

        <AddPeople
          userId={user.id}
          takenIds={[...peopleIds, ...invitedIds]}
          invited={invitedIds.map((uid) => ({ id: uid, profile: profiles[uid] }))}
          onAdd={addPerson}
        />

        {iAmOriginal ? (
          <button type="button" className={m.btnDanger} onClick={endMeetup} disabled={busy}>
            {status === 'live' ? (isGroup ? 'End meetup for everyone' : 'End meetup') : 'Cancel meetup'}
          </button>
        ) : (
          <button type="button" className={m.btnDanger} onClick={leaveMeetup} disabled={busy}>
            Leave meetup
          </button>
        )}
      </aside>
    </div>
  );
}

function Centered({ title, text, avatar, pulse, loading, children }) {
  return (
    <div className={s.page}>
      <div className={s.topBar} style={{ maxWidth: 440, margin: '0 auto' }}>
        <Link href="/friends" className={s.backBtn} aria-label="Back to friends">
          <ArrowLeft />
        </Link>
        <ThemeToggle />
      </div>
      <div className={`${s.card} ${s.centerCard}`}>
        {avatar && (
          <div className={`${s.avatar} ${s.avatarAlt} ${s.bigAvatar} ${pulse ? s.pulseRing : ''}`}>{avatar}</div>
        )}
        {loading && <span className={s.spinner} aria-hidden="true" />}
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
