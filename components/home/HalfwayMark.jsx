/** The Halfway mark: two people joined by a road, with the meeting point between. */
export default function HalfwayMark({ size = 24, className, title }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title && <title>{title}</title>}
      <path d="M2.5 12h19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="6.6" cy="12" r="3" fill="currentColor" />
      <circle cx="17.4" cy="12" r="3" fill="currentColor" />
      <rect x="10.3" y="10.3" width="3.4" height="3.4" rx="0.6" transform="rotate(45 12 12)" fill="currentColor" />
    </svg>
  );
}
