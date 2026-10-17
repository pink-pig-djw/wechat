/** App mark: two overlapping speech bubbles. */
export function Logo({ size = 40, muted = false, className = '' }) {
  return (
    <svg
      className={`logo ${muted ? 'logo-muted' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M26 14c-9.4 0-17 6.3-17 14.1 0 4.4 2.4 8.4 6.2 11l-1.5 4.6 5.4-2.8c2.1.6 4.4 1 6.9 1 .6 0 1.2 0 1.7-.1-.4-1.3-.6-2.6-.6-4 0-7.9 7.6-14.3 17-14.3h.9C43.4 18.3 35.5 14 26 14zm-6 7.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zm12 0a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z"
      />
      <path
        fill="currentColor"
        d="M55 37.8c0-6.5-6.4-11.8-14.2-11.8s-14.2 5.3-14.2 11.8 6.4 11.8 14.2 11.8c1.8 0 3.6-.3 5.2-.8l4.4 2.3-1.2-3.8c3.5-2.1 5.8-5.6 5.8-9.5zm-18.9-1.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm9.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z"
      />
    </svg>
  );
}
