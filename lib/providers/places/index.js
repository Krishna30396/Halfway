import { placesOverpass } from './overpass';
import { placesNominatim } from './nominatim';

// Provider seam. Overpass first (richest data); when every mirror is down or
// overloaded, Nominatim's category search keeps the list from coming up empty.

export async function places(params) {
  const provider = process.env.PLACES_PROVIDER || 'overpass';
  if (provider === 'nominatim') return placesNominatim(params);
  if (provider !== 'overpass') {
    throw new Error(`Unknown places provider: ${provider}`);
  }
  try {
    return await placesOverpass(params);
  } catch (err) {
    if (err.code !== 'OVERPASS_DOWN') throw err;
    return placesNominatim(params);
  }
}
