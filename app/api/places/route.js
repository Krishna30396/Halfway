import { places } from '@/lib/providers/places';
import { CATEGORY_IDS } from '@/lib/categories';
import { cached, TTL } from '@/lib/cache';
import { mergeSaved } from '@/lib/placeInfo';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  const radiusKm = Math.min(Math.max(parseFloat(params.get('radiusKm')) || 5, 0.5), 25);
  const categoryIds = (params.get('categories') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((id) => CATEGORY_IDS.has(id));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'A meeting point is needed first.' }, { status: 400 });
  }
  if (!categoryIds.length) {
    return Response.json({ places: [] });
  }

  const key = `places:${lat.toFixed(4)},${lng.toFixed(4)}:${radiusKm}:${[...categoryIds].sort().join(',')}`;
  try {
    // OSM places, plus the saved Google ones (seeded Hyderabad places) from our database.
    const results = await cached(key, TTL.PLACES, async () =>
      mergeSaved(await places({ lat, lng, radiusKm, categoryIds }), { lat, lng, radiusKm, categoryIds })
    );
    return Response.json({ places: results });
  } catch (err) {
    return Response.json(
      { error: "Couldn't load places right now. Try again in a moment." },
      { status: 502 }
    );
  }
}
