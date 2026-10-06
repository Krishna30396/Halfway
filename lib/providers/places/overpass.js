import { overpassQuery } from '@/lib/overpass';
import { CATEGORIES } from '@/lib/categories';
import { haversine } from '@/lib/geo';

export async function placesOverpass({ lat, lng, radiusKm, categoryIds }) {
  const selected = CATEGORIES.filter((c) => categoryIds.includes(c.id));
  if (!selected.length) return [];

  const radiusM = Math.round(radiusKm * 1000);
  const clauses = selected
    .flatMap((c) => c.osm.map(([k, v]) => `nwr["${k}"="${v}"](around:${radiusM},${lat},${lng});`))
    .join('\n');

  // 400: dense city centres (Hyderabad, London) genuinely exceed 250.
  const query = `[out:json][timeout:25];\n(\n${clauses}\n);\nout center 400;`;
  const data = await overpassQuery(query);

  const tagToCategory = new Map();
  for (const c of selected) {
    for (const [k, v] of c.osm) tagToCategory.set(`${k}=${v}`, c.id);
  }

  const seen = new Set();
  const places = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const name = tags.name;
    if (!name) continue; // unnamed features are noise

    const plat = el.lat ?? el.center?.lat;
    const plng = el.lon ?? el.center?.lon;
    if (plat == null || plng == null) continue;

    // Dedupe on name + coordinates rounded to 4dp — Overpass returns the
    // same venue as both a node and a way surprisingly often.
    const key = `${name}|${plat.toFixed(4)}|${plng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let category = null;
    for (const [k, v] of Object.entries(tags)) {
      const hit = tagToCategory.get(`${k}=${v}`);
      if (hit) { category = hit; break; }
    }

    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    const imageTag = tags.image || null;
    const wikimediaCommons = tags.wikimedia_commons || tags['wikimedia_commons'] || null;
    const wikidata = tags.wikidata || null;

    places.push({
      id: `${el.type}/${el.id}`,
      name,
      lat: plat,
      lng: plng,
      category,
      cuisine: tags.cuisine || null,
      website: tags.website || tags['contact:website'] || null,
      openingHours: tags.opening_hours || null,
      street: street || tags['addr:suburb'] || null,
      distanceKm: haversine([lat, lng], [plat, plng]),
      imageTag,
      wikimediaCommons,
      wikidata,
    });
  }
  // Nearest first — Overpass returns database order, which reads as random.
  places.sort((a, b) => a.distanceKm - b.distanceKm);
  return places;
}
