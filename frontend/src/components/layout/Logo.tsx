/**
 * PFN mark: three ascending bars in a rounded square.
 *
 * Inline SVG rather than a glyph or a bitmap so one asset covers the 16px
 * favicon, the sidebar and the login screen, and so the gradient id stays
 * unique when the logo is rendered more than once on a page. Kept in sync with
 * public/favicon.svg.
 */
interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pfnMark" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#pfnMark)" />
      <rect x="8.5" y="17" width="4" height="7" rx="1.2" fill="#ffffff" opacity="0.72" />
      <rect x="14" y="12.5" width="4" height="11.5" rx="1.2" fill="#ffffff" opacity="0.88" />
      <rect x="19.5" y="8.5" width="4" height="15.5" rx="1.2" fill="#ffffff" />
    </svg>
  );
}
