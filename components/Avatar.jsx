'use client';

import { initialOf } from '@/lib/social';

// Simple illustrated faces. `profiles.avatar` stores one of these ids; with no
// avatar picked, the person's initial is shown instead.
const SKIN = { light: '#F6D3B3', tan: '#E0A97E', brown: '#B97A50', deep: '#7D4E2F' };
const HAIR = { black: '#2A211D', brown: '#6B4329', auburn: '#A4472A', grey: '#9C9690' };

export const AVATARS = [
  { id: 'f1', bg: '#FFE1D2', skin: SKIN.tan, hair: HAIR.black, style: 'short' },
  { id: 'f2', bg: '#FDE6B8', skin: SKIN.brown, hair: HAIR.black, style: 'long' },
  { id: 'f3', bg: '#D9EEDF', skin: SKIN.light, hair: HAIR.auburn, style: 'bun' },
  { id: 'f4', bg: '#DCE7FA', skin: SKIN.deep, hair: HAIR.black, style: 'curly' },
  { id: 'f5', bg: '#F3DDF0', skin: SKIN.tan, hair: HAIR.brown, style: 'wavy' },
  { id: 'f6', bg: '#E8E2D8', skin: SKIN.brown, hair: HAIR.black, style: 'beard' },
  { id: 'f7', bg: '#FFE1D2', skin: SKIN.light, hair: HAIR.grey, style: 'specs' },
  { id: 'f8', bg: '#D7F0F0', skin: SKIN.deep, hair: HAIR.black, style: 'cap' },
];

const byId = Object.fromEntries(AVATARS.map((a) => [a.id, a]));

function Hair({ style, color }) {
  switch (style) {
    case 'long':
      return <path d="M16 34c0-12 7-20 16-20s16 8 16 20v16h-6V34H22v16h-6z" fill={color} />;
    case 'bun':
      return (
        <>
          <circle cx="32" cy="12" r="6" fill={color} />
          <path d="M18 31c0-9 6-15 14-15s14 6 14 15c-4-5-9-7-14-7s-10 2-14 7z" fill={color} />
        </>
      );
    case 'curly':
      return (
        <g fill={color}>
          {[18, 24, 30, 36, 42, 46, 16].map((x, i) => (
            <circle key={i} cx={x} cy={i === 5 || i === 6 ? 28 : 20 + (i % 2) * 2} r="6" />
          ))}
        </g>
      );
    case 'wavy':
      return <path d="M17 36c-2-13 5-21 15-21s17 8 15 21c-2-6-4-8-6-9-3 3-11 4-18 2-2 2-4 4-6 7z" fill={color} />;
    case 'cap':
      return (
        <>
          <path d="M18 28c0-8 6-14 14-14s14 6 14 14z" fill="#F2541B" />
          <rect x="30" y="26" width="22" height="4" rx="2" fill="#C83E0E" />
        </>
      );
    default: // short, beard, specs
      return <path d="M18 30c0-9 6-15 14-15s14 6 14 15c-3-3-6-5-9-5-4 0-6 2-11 2-3 0-5 1-8 3z" fill={color} />;
  }
}

function Face({ a }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <rect width="64" height="64" fill={a.bg} />
      <path d="M12 64c2-10 10-15 20-15s18 5 20 15z" fill={a.style === 'cap' ? '#2F78B0' : '#F2541B'} opacity="0.9" />
      <rect x="27" y="40" width="10" height="10" rx="3" fill={a.skin} />
      <ellipse cx="32" cy="32" rx="13" ry="14" fill={a.skin} />
      <Hair style={a.style} color={a.hair} />
      <circle cx="27" cy="33" r="1.7" fill="#2A211D" />
      <circle cx="37" cy="33" r="1.7" fill="#2A211D" />
      <path d="M27.5 39.5c2.6 2.2 6.4 2.2 9 0" stroke="#2A211D" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="37.5" r="2.2" fill="#F28B6B" opacity="0.35" />
      <circle cx="40" cy="37.5" r="2.2" fill="#F28B6B" opacity="0.35" />
      {a.style === 'beard' && <path d="M20 35c1 9 6 13 12 13s11-4 12-13c-3 4-7 6-12 6s-9-2-12-6z" fill={a.hair} />}
      {a.style === 'specs' && (
        <g stroke="#2A211D" strokeWidth="1.4" fill="none">
          <circle cx="27" cy="33" r="4.2" />
          <circle cx="37" cy="33" r="4.2" />
          <path d="M31.2 33h1.6" />
        </g>
      )}
    </svg>
  );
}

/** A person's avatar: their chosen face, or their initial. */
export default function Avatar({ person, id, size = 40, className, style }) {
  const a = byId[id ?? person?.avatar];
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: size * 0.42,
        ...(a ? { padding: 0, background: a.bg } : null),
        ...style,
      }}
    >
      {a ? <Face a={a} /> : initialOf(person)}
    </span>
  );
}
