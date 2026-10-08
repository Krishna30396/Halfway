// Category colours: Ember + Ink. Warm, mid-strength tones that identify a
// place on the map without competing with ember (the one action colour).
// `short` is the chip label on the search screen; `plural` reads in a
// sentence ("Find cafés halfway").
export const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurants', short: 'Food',        plural: 'food',          color: '#C4553A', osm: [['amenity', 'restaurant']] },
  { id: 'cafe',       label: 'Cafés',       short: 'Café',        plural: 'cafés',         color: '#8E5B3A', osm: [['amenity', 'cafe'], ['amenity', 'ice_cream']] },
  { id: 'bar',        label: 'Bars & pubs', short: 'Bar',         plural: 'bars',          color: '#7B4F9C', osm: [['amenity', 'bar'], ['amenity', 'pub'], ['amenity', 'biergarten']] },
  { id: 'fastfood',   label: 'Quick bites', short: 'Quick bites', plural: 'quick bites',   color: '#CF9420', osm: [['amenity', 'fast_food'], ['amenity', 'food_court']] },
  { id: 'park',       label: 'Parks',       short: 'Park',        plural: 'parks',         color: '#3E8B5C', osm: [['leisure', 'park'], ['leisure', 'garden']] },
  { id: 'sport',      label: 'Sports',      short: 'Gym',         plural: 'gyms',          color: '#2F78B0', osm: [['leisure', 'sports_centre'], ['leisure', 'fitness_centre'], ['leisure', 'swimming_pool']] },
  { id: 'culture',    label: 'Culture',     short: 'Culture',     plural: 'culture spots', color: '#B0457C', osm: [['amenity', 'cinema'], ['amenity', 'theatre'], ['tourism', 'museum'], ['tourism', 'gallery']] },
  { id: 'games',      label: 'Games',       short: 'Games',       plural: 'games',         color: '#23968A', osm: [['leisure', 'bowling_alley'], ['leisure', 'escape_game'], ['leisure', 'amusement_arcade']] },
  { id: 'shopping',   label: 'Shopping',    short: 'Shopping',    plural: 'shops',         color: '#5E64B0', osm: [['shop', 'mall'], ['shop', 'department_store'], ['amenity', 'marketplace']] },
];

export const CATEGORY_COLORS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
