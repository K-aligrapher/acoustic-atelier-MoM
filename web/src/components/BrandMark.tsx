/** Tuning fork inside two resonance arcs — the Acoustic Atelier mark. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="20" cy="20" r="18.5" strokeWidth="0.75" opacity="0.45" />
        <path d="M15 8.5v11.5a5 5 0 0 0 10 0V8.5" strokeWidth="1.6" />
        <path d="M20 25v8.5" strokeWidth="1.6" />
        <path d="M9.5 14.5a12 12 0 0 0 0 11" strokeWidth="1" opacity="0.7" />
        <path d="M30.5 14.5a12 12 0 0 1 0 11" strokeWidth="1" opacity="0.7" />
        <path d="M6 12a17 17 0 0 0 0 16" strokeWidth="0.8" opacity="0.4" />
        <path d="M34 12a17 17 0 0 1 0 16" strokeWidth="0.8" opacity="0.4" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <span>Acoustic</span> <span>Atelier</span>
    </span>
  );
}
