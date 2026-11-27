/**
 * Setup's drawings
 *
 * The Back arrow and the progress glyph. Every drawing is hidden from a
 * screen reader and takes no focus, but for the progress glyph, which is an
 * image named for the step.
 *
 * @module components/setup/drawings
 */

export function BackArrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 10H4M9 5l-5 5 5 5" />
    </svg>
  );
}

/** Two 24 by 4 px segments with 4 px between them, the first filled on step 1, both on step 2; an image named "Step n of 2". `under` draws the copy that stands under the heading when the Back row is too narrow. */
export function ProgressGlyph({ step, under = false }: { step: 1 | 2; under?: boolean }) {
  return (
    <svg
      className={under ? 'setup-progress setup-progress--under' : 'setup-progress'}
      role="img"
      aria-label={`Step ${step} of 2`}
      viewBox="0 0 52 4"
      width="52"
      height="4"
      focusable="false"
    >
      <rect className="setup-progress__on" x="0" y="0" width="24" height="4" />
      {step === 2 ? (
        <rect className="setup-progress__on" x="28" y="0" width="24" height="4" />
      ) : (
        <rect className="setup-progress__off" x="28.5" y="0.5" width="23" height="3" />
      )}
    </svg>
  );
}
