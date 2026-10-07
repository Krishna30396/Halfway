import { rateLimited } from '@/lib/limiter';
import { nominatimHeaders } from '@/lib/nominatimHeaders';

// Nominatim fallback. Usage policy: max 1 request/second, and a User-Agent
// that identifies the app (see nominatimHeaders). Both enforced here, not in components.

export async function geocodeNominatim(q) {
  const base = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
  const url = `${base}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6`;

  return rateLimited('nominatim', 1000, async () => {
    const res = await fetch(url, {
      headers: nominatimHeaders(),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json();
    return (data || []).map((r) => ({
      name: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  });
}
