import React, { useId } from 'react';

interface BrandLogoProps {
  /** Hide the "PARTNER" lockup — useful in tight spots like the header. */
  showPartner?: boolean;
  className?: string;
  /** Accessible name; pass null for decorative use next to a visible title. */
  title?: string | null;
}

/**
 * The bhoomiX wordmark, drawn as vector geometry.
 *
 * The supplied artwork is a black-background raster, which would sit as a black
 * slab on this app's cream surfaces. Rebuilding it as SVG fixes that — the
 * "bhoomi" wordmark inherits `currentColor` so it reads correctly on light and
 * dark alike, while the X keeps its blue→chrome and purple→chrome gradients.
 *
 * Letterforms are stroked primitives rather than text, so the mark never
 * depends on a font being loaded and cannot reflow between devices.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  showPartner = true,
  className = '',
  title = 'BhoomiX Partner',
}) => {
  // Gradient ids must be unique per instance or a second copy on the page
  // re-uses the first one's definitions.
  const uid = useId().replace(/:/g, '');
  const blueId = `bx-blue-${uid}`;
  const purpleId = `bx-purple-${uid}`;
  const partnerId = `bx-partner-${uid}`;
  const lineLId = `bx-line-l-${uid}`;
  const lineRId = `bx-line-r-${uid}`;

  return (
    <svg
      viewBox={showPartner ? '0 0 1200 400' : '0 0 1200 300'}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        {/*
          Left arm: blue at the top-left, resolving to chrome bottom-right.
          Chrome carries shadow stops as well as highlights — an all-white tail
          disappeared against this app's cream surface.
        */}
        <linearGradient id={blueId} x1="862" y1="62" x2="1102" y2="262"
          gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="32%" stopColor="#3b82f6" />
          <stop offset="56%" stopColor="#e2e8f0" />
          <stop offset="74%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#b8c2cf" />
        </linearGradient>

        {/* Right arm: purple at the bottom-left, resolving to chrome top-right. */}
        <linearGradient id={purpleId} x1="862" y1="262" x2="1102" y2="62"
          gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="26%" stopColor="#c4b5fd" />
          <stop offset="50%" stopColor="#f1f5f9" />
          <stop offset="68%" stopColor="#64748b" />
          <stop offset="86%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>

        <linearGradient id={partnerId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>

        <linearGradient id={lineLId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id={lineRId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ---- "bhoomi" ---------------------------------------------------- */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={17}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* b */}
        <path d="M60 55 V230" />
        <circle cx="112.5" cy="177.5" r="52.5" />
        {/* h */}
        <path d="M195 55 V230" />
        <path d="M195 177.5 A52.5 52.5 0 0 1 300 177.5 V230" />
        {/* o o */}
        <circle cx="382.5" cy="177.5" r="52.5" />
        <circle cx="517.5" cy="177.5" r="52.5" />
        {/* m */}
        <path d="M600 125 V230" />
        <path d="M600 177.5 A45 52.5 0 0 1 690 177.5 V230" />
        <path d="M690 177.5 A45 52.5 0 0 1 780 177.5 V230" />
        {/* i */}
        <path d="M810 125 V230" />
      </g>
      <circle cx="810" cy="82" r="10" fill="currentColor" />

      {/* ---- the X ------------------------------------------------------- */}
      <g strokeWidth={54} strokeLinecap="butt" fill="none">
        <line x1="862" y1="62" x2="1102" y2="262" stroke={`url(#${blueId})`} />
        <line x1="862" y1="262" x2="1102" y2="62" stroke={`url(#${purpleId})`} />
      </g>

      {/* ---- "PARTNER" lockup -------------------------------------------- */}
      {showPartner && (
        <g>
          {/* Hairlines start clear of the word, which spans roughly x=370..830. */}
          <line x1="150" y1="330" x2="330" y2="330" stroke={`url(#${lineLId})`} strokeWidth="3" />
          <line x1="870" y1="330" x2="1050" y2="330" stroke={`url(#${lineRId})`} strokeWidth="3" />
          <text
            x="600"
            y="330"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={`url(#${partnerId})`}
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
            fontSize="64"
            fontWeight="600"
            letterSpacing="24"
            /* Trailing letter-space skews the centring; nudge back by half. */
            dx="12"
          >
            PARTNER
          </text>
        </g>
      )}
    </svg>
  );
};
