// Stadia with a key when configured, keyless OSM raster otherwise.
const stadiaKey = process.env.NEXT_PUBLIC_STADIA_API_KEY;
const STADIA_DEFAULT = 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png';

export const TILE_URL = stadiaKey
  ? `${process.env.NEXT_PUBLIC_TILE_URL || STADIA_DEFAULT}?api_key=${stadiaKey}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION = stadiaKey
  ? process.env.NEXT_PUBLIC_TILE_ATTRIBUTION
  : '© OpenStreetMap contributors';
