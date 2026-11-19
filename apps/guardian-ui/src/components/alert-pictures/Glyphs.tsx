/**
 * The alert pictures' two glyphs: an empty frame, where an alert has no
 * picture, and the problem mark beside a sentence that names what went
 * wrong. Both are drawn in the words' colour and hidden from a screen
 * reader; the sentence beside each carries the meaning.
 *
 * @module components/alert-pictures/Glyphs
 */

interface GlyphProps {
  size?: number;
  className?: string;
}

/** A frame with nothing in it. */
export function EmptyFrameGlyph({ size = 24, className = '' }: GlyphProps) {
  return (
    <svg
      className={`alert-picture__empty ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 19 21 5" />
    </svg>
  );
}

/** A triangle with a mark in it. */
export function ProblemGlyph({ size = 24, className = '' }: GlyphProps) {
  return (
    <svg
      className={`alert-picture__problem ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.25v.01" />
    </svg>
  );
}
