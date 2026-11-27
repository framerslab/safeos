/**
 * Setup's drawings
 *
 * The Back arrow, the progress glyph, the camera and the glyph of each
 * answer to what the device is watching. Every drawing is hidden from a
 * screen reader and takes no focus, but for the progress glyph, which is an
 * image named for the step.
 *
 * @module components/setup/drawings
 */

import { cloneElement } from 'react';
import { IconPaw } from '@/components/icons';
import type { SetupChoice } from '@/lib/setup-steps';

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

/** The camera drawn at rest in step 1's frame: a body, a lens and a raised top. */
export function CameraDrawing() {
  return (
    <svg
      className="setup-camera-drawing"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="24" height="16" rx="3" />
      <circle cx="16" cy="18" r="5" />
      <path d="M11 10l2-4h6l2 4" />
    </svg>
  );
}

/** The glyph of an answer: a paw, a crib, an armchair, an open doorway and, for a lost pet, the paw the dashboard's Lost and Found row draws. Decorative. */
export function UseGlyph({ use }: { use: SetupChoice }) {
  if (use === 'lost_found') {
    return cloneElement(IconPaw({ size: 24, className: 'setup-use__glyph' }), { 'aria-hidden': 'true', focusable: 'false' });
  }
  return (
    <svg
      className="setup-use__glyph"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {use === 'pet' ? (
        <>
          <circle cx="7" cy="9" r="1.75" />
          <circle cx="10.5" cy="6" r="1.75" />
          <circle cx="13.5" cy="6" r="1.75" />
          <circle cx="17" cy="9" r="1.75" />
          <path d="M12 11.5c-2.8 0-5 2.6-5 5 0 1.6 1.2 2.5 2.6 2.5.9 0 1.6-.5 2.4-.5s1.5.5 2.4.5c1.4 0 2.6-.9 2.6-2.5 0-2.4-2.2-5-5-5z" />
        </>
      ) : null}
      {use === 'baby' ? <path d="M4 7v13M20 7v13M4 10h16M4 18h16M8 10v8M12 10v8M16 10v8" /> : null}
      {use === 'elderly' ? (
        <>
          <path d="M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
          <path d="M3 12a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v5H3z" />
          <path d="M5 17v3M19 17v3" />
        </>
      ) : null}
      {use === 'security' ? (
        <>
          <path d="M5 21V3h14v18" />
          <path d="M5 21l7-2V5L5 3" />
          <path d="M10 12h.01" />
        </>
      ) : null}
    </svg>
  );
}
