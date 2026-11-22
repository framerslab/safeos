/**
 * The dashboard's drawings
 *
 * The problem glyph, the corner ticks, the camera frame drawn while nothing
 * is watching and its level line. Each is decoration and hidden from
 * assistive technology: the words beside it say what it shows.
 *
 * @module components/dashboard/Drawn
 */

/** The filled triangle, point up, 12 px, in the alert colour. */
export function ProblemMark() {
  return (
    <svg className="problem-mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M6 1 11.5 11H0.5Z" />
    </svg>
  );
}

/** The four corner ticks round a picture or a drawn frame. */
export function CornerTicks() {
  return (
    <span className="corner-ticks" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** A flat level line with its one tick; `broken` draws the gap of the error state. */
export function LevelLine({ broken = false }: { broken?: boolean }) {
  return (
    <svg className="level-line" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={broken ? 'M0 11H52M68 11H120M32 11V3' : 'M0 11H120M32 11V3'} />
    </svg>
  );
}

/**
 * The camera frame drawn while nothing is watching: the panel colour inside
 * the four ticks, a flat level line with its one tick; with `loading`, an
 * accent bar that grows along its foot in the line's place.
 */
export function CameraFrame({ loading = false }: { loading?: boolean }) {
  return (
    <span className="drawn-frame" data-loading={loading ? 'true' : undefined} aria-hidden="true">
      <CornerTicks />
      <LevelLine />
    </span>
  );
}
