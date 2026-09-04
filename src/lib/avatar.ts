/**
 * Deterministic initials avatar as a data URI.
 *
 * The app previously hard-coded expiring `googleusercontent.com` image URLs,
 * which render as broken images once the signed links lapse. Generating the
 * avatar locally keeps profile chrome working offline and forever.
 */

const PALETTE = [
  ['#006a6a', '#c0fffe'],
  ['#5e604d', '#e4e5cb'],
  ['#8a5a2b', '#ffdcc0'],
  ['#4a5b8c', '#d8e2ff'],
  ['#7a3c6b', '#ffd7f2'],
] as const;

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function initialsAvatar(name: string, seed = name): string {
  const [fg, bg] = PALETTE[hash(seed || 'bhoomix') % PALETTE.length];
  const initials = initialsOf(name || 'BhoomiX Partner');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<rect width="96" height="96" rx="48" fill="${bg}"/>
<text x="48" y="48" dy=".36em" text-anchor="middle" fill="${fg}"
 font-family="Inter, system-ui, sans-serif" font-size="36" font-weight="700">${initials}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
