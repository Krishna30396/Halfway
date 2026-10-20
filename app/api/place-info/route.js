import { getPlaceInfo, getMenuPhotos, getSavedPlaceInfo, getFeatured } from '@/lib/placeInfo';

export const dynamic = 'force-dynamic';

const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  if (params.get('featured') === '1') {
    const places = await getFeatured(parseFloat(params.get('lat')), parseFloat(params.get('lng'))).catch(() => []);
    return Response.json({ places });
  }
  const key = clean(params.get('key'), 120);
  if (!key) return Response.json({ error: 'key is required' }, { status: 400 });

  try {
    if (params.get('saved') === '1') {
      return Response.json(await getSavedPlaceInfo(key));
    }
    if (params.get('menu') === '1') {
      return Response.json(await getMenuPhotos(key));
    }
    const name = clean(params.get('name'), 120);
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'name, lat and lng are required' }, { status: 400 });
    }
    return Response.json(await getPlaceInfo({ key, name, lat, lng, category: clean(params.get('cat'), 20) }));
  } catch (err) {
    console.error('place-info failed', err?.message);
    return Response.json({ status: 'error' }, { status: 502 });
  }
}
