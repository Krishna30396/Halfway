// Photon geocoder — no key, no contact header required.

const TYPE_LABEL = {
  city: 'city',
  town: 'town',
  village: 'village',
  suburb: 'area',
  neighbourhood: 'area',
  quarter: 'area',
  hamlet: 'village',
  locality: 'area',
  station: 'station',
  aerodrome: 'airport',
};

function label(p) {
  // Small localities need every disambiguating layer: locality → district →
  // city → state. Photon often returns several same-named objects; without
  // this the dropdown shows three identical rows.
  const parts = [p.name, p.district, p.city, p.state, p.country].filter(Boolean);
  const deduped = parts.filter((v, i) => v !== parts[i - 1]);
  return deduped.join(', ');
}

export async function geocodePhoton(q, bias) {
  const base = process.env.PHOTON_URL || 'https://photon.komoot.io';
  let url = `${base}/api/?q=${encodeURIComponent(q)}&limit=8`;
  // Bias ranking toward the other chosen point, so nearby small places
  // outrank same-named ones in other states.
  if (bias) url += `&lat=${bias.lat}&lon=${bias.lng}`;

  // Photon is sometimes overloaded for 20 s+; give up quickly and let
  // Nominatim answer instead (it replies in under a second).
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  const results = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    let name = label(p) || p.name || q;
    const kind = TYPE_LABEL[p.osm_value];
    const entry = {
      name,
      kind: kind || null,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    };
    // Same label within ~1km is the same place twice (node + boundary etc.).
    const key = `${name}|${entry.lat.toFixed(2)}|${entry.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(entry);
  }
  return results;
}
