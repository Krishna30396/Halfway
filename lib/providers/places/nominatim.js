import { rateLimited } from '@/lib/limiter';
import { nominatimHeaders } from '@/lib/nominatimHeaders';
import { haversine } from '@/lib/geo';
import { CATEGORIES } from '@/lib/categories';

// Fallback for when every Overpass mirror is down or overloaded (it happens):
// Nominatim's category phrases ("cafe", "park"…) searched inside a box around
// the meeting point. Fewer results than Overpass, but answers in under a second.
// Nominatim allows 1 request/second, so at most 4 categories are searched.

const PHRASE = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  fastfood: 'fast food',
  park: 'park',
  sport: 'sports centre',
  culture: 'cinema',
  games: 'bowling alley',
  shopping: 'mall',
};

export async function placesNominatim({ lat, lng, radiusKm, categoryIds }) {
  const base = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((v) => v.toFixed(5)).join(',');

  const tagToCategory = new Map();
  for (const c of CATEGORIES) for (const [k, v] of c.osm) tagToCategory.set(`${k}=${v}`, c.id);

  const seen = new Set();
  const places = [];
  for (const id of categoryIds.filter((c) => PHRASE[c]).slice(0, 4)) {
    const url = `${base}/search?q=${encodeURIComponent(PHRASE[id])}&viewbox=${viewbox}&bounded=1&format=jsonv2&limit=40&extratags=1&addressdetails=1`;
    let rows;
    try {
      rows = await rateLimited('nominatim', 1000, async () => {
        const res = await fetch(url, {
          headers: nominatimHeaders(),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
        return res.json();
      });
    } catch {
      continue; // one category failing shouldn't lose the others
    }
    for (const r of rows || []) {
      if (!r.name) continue;
      const plat = parseFloat(r.lat);
      const plng = parseFloat(r.lon);
      const key = `${r.name}|${plat.toFixed(4)}|${plng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tags = r.extratags || {};
      const a = r.address || {};
      places.push({
        id: `${r.osm_type}/${r.osm_id}`,
        name: r.name,
        lat: plat,
        lng: plng,
        category: tagToCategory.get(`${r.category}=${r.type}`) || id,
        cuisine: tags.cuisine || null,
        website: tags.website || tags['contact:website'] || null,
        openingHours: tags.opening_hours || null,
        street: [a.house_number, a.road].filter(Boolean).join(' ') || a.suburb || a.neighbourhood || null,
        distanceKm: haversine([lat, lng], [plat, plng]),
        imageTag: tags.image || null,
        wikimediaCommons: tags.wikimedia_commons || null,
        wikidata: tags.wikidata || null,
      });
    }
  }
  places.sort((x, y) => x.distanceKm - y.distanceKm);
  return places;
}
