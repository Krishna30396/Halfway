// OSRM demo server — keyless, local-dev fallback only (no SLA).

const roadName = (s) => s.name || s.ref || 'the road';

function instructionFor(step) {
  const { type, modifier, exit } = step.maneuver;
  const name = roadName(step);
  const dir = modifier || '';
  switch (type) {
    case 'depart':
      return `Head out on ${name}`;
    case 'arrive':
      return 'You have arrived';
    case 'turn':
      if (modifier === 'straight') return `Continue straight on ${name}`;
      if (modifier === 'uturn') return `Make a U-turn onto ${name}`;
      return `Turn ${dir} onto ${name}`;
    case 'new name':
    case 'continue':
      if (modifier === 'uturn') return `Make a U-turn onto ${name}`;
      return `Continue onto ${name}`;
    case 'merge':
      return dir ? `Merge ${dir} onto ${name}` : `Merge onto ${name}`;
    case 'on ramp':
      return dir ? `Take the ramp ${dir} onto ${name}` : `Take the ramp onto ${name}`;
    case 'off ramp':
      return dir ? `Take the exit ${dir}` : 'Take the exit';
    case 'fork':
      return `Keep ${dir || 'ahead'} at the fork onto ${name}`;
    case 'end of road':
      return `At the end of the road, turn ${dir} onto ${name}`;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return exit
        ? `At the roundabout, take exit ${exit} onto ${name}`
        : `Go through the roundabout onto ${name}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout onto ${name}`;
    default:
      return dir ? `Go ${dir} onto ${name}` : `Continue on ${name}`;
  }
}

export async function routeOsrm(from, to) {
  const base = process.env.OSRM_URL || 'https://router.project-osrm.org';
  // OSRM takes lon,lat pairs in the path.
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url =
    `${base}/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&alternatives=true&steps=true`;

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();

  if (data.code === 'NoRoute' || !data.routes?.length) {
    const err = new Error('No drivable route between these points');
    err.code = 'NO_ROUTE';
    throw err;
  }
  if (data.code !== 'Ok') throw new Error(`OSRM error: ${data.code}`);

  // OSRM snaps waypoints to the nearest road with UNLIMITED radius: asked to
  // route London → New York, it happily drives you to the coast of Portugal.
  // If an endpoint snapped more than 10 km from where the user actually is,
  // there is no real route to that place.
  const badSnap = (data.waypoints || []).some((w) => (w.distance || 0) > 10000);
  if (badSnap) {
    const err = new Error('No drivable route between these points');
    err.code = 'NO_ROUTE';
    throw err;
  }

  // Convert [lon,lat] → [lat,lng] at the provider boundary so nothing
  // downstream has to think about coordinate order.
  return data.routes.map((r) => ({
    coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    steps: (r.legs?.[0]?.steps || []).map((s) => ({
      instruction: instructionFor(s),
      type: s.maneuver.type,
      modifier: s.maneuver.modifier || null,
      location: [s.maneuver.location[1], s.maneuver.location[0]],
    })),
  }));
}
