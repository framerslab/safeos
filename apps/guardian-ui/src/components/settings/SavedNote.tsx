'use client';

/**
 * "Saved" beside a row after a change, read once by a polite status; a
 * change the browser refused says so in the ink with the problem glyph, and
 * that stays.
 *
 * @module components/settings/SavedNote
 */

import type { SaveNote } from '@/lib/settings-save';
import { CheckGlyph, ProblemGlyph } from './glyphs';

export const NOT_SAVED = 'Not saved. This browser is not keeping settings.';

export function SavedNote({ note }: { note: SaveNote }) {
  return (
    <span
      className={`set-saved${note === 'not-saved' ? ' set-saved--refused' : ''}`}
      role="status"
      aria-live="polite"
    >
      {note === 'saved' ? (
        <>
          <CheckGlyph />
          Saved
        </>
      ) : note === 'not-saved' ? (
        <>
          <ProblemGlyph />
          {NOT_SAVED}
        </>
      ) : null}
    </span>
  );
}

export default SavedNote;
