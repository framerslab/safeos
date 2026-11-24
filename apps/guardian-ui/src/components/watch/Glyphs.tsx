/**
 * The watch's glyphs
 *
 * The speaker of Mute alerts, the camera drawn in the frame before a watch,
 * the bell of the empty alert list and the chevron of a disclosure row. Each
 * is decoration, hidden from assistive technology and stroked in the colour
 * of the words beside it, which say what it shows.
 *
 * @module components/watch/Glyphs
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** A speaker, crossed while alerts are muted. */
export function SpeakerGlyph({ crossed }: { crossed: boolean }) {
  return (
    <svg className="watch-glyph" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...STROKE}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {crossed ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11" />}
    </svg>
  );
}

/** The camera drawn in the frame before a watch: 32 px, in the line colour. */
export function CameraGlyph() {
  return (
    <svg className="watch-glyph watch-glyph--camera" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...STROKE}>
      <rect x="3" y="9" width="19" height="15" rx="2" />
      <path d="M22 14l7-4v13l-7-4" />
      <circle cx="12.5" cy="16.5" r="3.5" />
    </svg>
  );
}

/** The bell of the empty alert list. */
export function BellGlyph() {
  return (
    <svg className="watch-glyph watch-glyph--bell" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...STROKE}>
      <path d="M9 21V14a7 7 0 0 1 14 0v7l2 3H7z" />
      <path d="M13.5 27a2.6 2.6 0 0 0 5 0" />
    </svg>
  );
}

/** The chevron at the right of a disclosure row; it turns while the row is open. */
export function ChevronGlyph() {
  return (
    <svg className="watch-glyph watch-glyph--chevron" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...STROKE}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
