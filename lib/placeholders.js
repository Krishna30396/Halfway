export const CATEGORY_ICONS = {
  restaurant: { emoji: '🍽️', bg: '#F5EDE7' },
  cafe:       { emoji: '☕',             bg: '#F2EDE0' },
  bar:        { emoji: '🍻',       bg: '#EDE7F0' },
  fastfood:   { emoji: '🍔',       bg: '#F5F0E0' },
  park:       { emoji: '🌳',       bg: '#E7F0E7' },
  sport:      { emoji: '⚽',             bg: '#E4EDF5' },
  culture:    { emoji: '🎭',       bg: '#F0E7EE' },
  games:      { emoji: '🎲',       bg: '#E5F0EC' },
  shopping:   { emoji: '🛍️', bg: '#E9EAF0' },
};

export function placeholderFor(category) {
  return CATEGORY_ICONS[category] || { emoji: '📍', bg: '#EDEDE9' };
}
