import { overpassQuery } from '@/lib/overpass';
import { haversine } from '@/lib/geo';
import { cached, TTL } from '@/lib/cache';

// Nearest wins. Distances are stretched by place type so a local area just
// beats a big city at the same spot, and a city has to be genuinely close:
// a city 12 km out scores like a neighbourhood 18 km out.
const DISTANCE_WEIGHT = {
  neighbourhood: 1,
  suburb: 1,
  village: 1.1,
  town: 1.15,
  hamlet: 1.3,
  city: 1.5,
};

async function findHubs(lat, lng, maxKm) {
  const query = `[out:json][timeout:25];
(
  node["place"~"^(city|town|village|suburb|neighbourhood|hamlet)$"](around:${Math.round(maxKm * 1000)},${lat},${lng});
);
out center 80;`;

  const data = await overpassQuery(query);
  const candidates = (data.elements || [])
    .filter((el) => el.tags?.name && el.tags?.place)
    .map((el) => {
      const distanceKm = haversine([lat, lng], [el.lat, el.lon]);
      return {
        id: `${el.type}/${el.id}`,
        name: el.tags.name,
        place: el.tags.place,
        lat: el.lat,
        lng: el.lon,
        distanceKm,
        effectiveKm: distanceKm * (DISTANCE_WEIGHT[el.tags.place] || 1.2),
      };
    })
    .sort((a, b) => a.effectiveKm - b.effectiveKm);

  return candidates.slice(0, 6);
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  const startKm = parseFloat(params.get('maxKm')) || 15;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'A midpoint is needed first.' }, { status: 400 });
  }

  const key = `hubs:${lat.toFixed(4)},${lng.toFixed(4)}:${startKm}`;
  try {
    const result = await cached(key, TTL.HUBS, async () => {
      // Expand if empty: 15 → 30 → 60 km, then fall back to the raw midpoint.
      for (const maxKm of [startKm, startKm * 2, startKm * 4]) {
        const hubs = await findHubs(lat, lng, maxKm);
        if (hubs.length) return { hubs, searchedKm: maxKm };
      }
      return { hubs: [], searchedKm: startKm * 4 };
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: "Couldn't reach the map service. Try again in a moment." },
      { status: 502 }
    );
  }
}
