/**
 * The settings pages' glyphs: the chevron of a row, the back link's chevron,
 * the check of "Saved" and the problem glyph beside a failure. Each is
 * aria-hidden beside the words that say the same.
 *
 * @module components/settings/glyphs
 */

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function ChevronGlyph({ to = 'right', className }: { to?: 'left' | 'right'; className?: string }) {
  return (
    <svg {...common} className={className ?? 'set-glyph set-glyph--chevron'}>
      <path d={to === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

export function CheckGlyph() {
  return (
    <svg {...common} className="set-glyph set-glyph--check">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ProblemGlyph() {
  return (
    <svg {...common} className="set-glyph set-glyph--problem">
      <path d="M12 3.5L2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.25v.25" />
    </svg>
  );
}
