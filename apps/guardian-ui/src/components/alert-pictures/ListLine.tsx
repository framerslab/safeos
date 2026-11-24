/**
 * The alert list's one line about a device that cannot keep pictures, under
 * the list's header: it ran out of room and the oldest pictures made way,
 * it is out of room and new pictures are not kept, or this window keeps
 * nothing. Read once from a polite status.
 *
 * @module components/alert-pictures/ListLine
 */

'use client';

import { useListLine } from '../../lib/alert-pictures/keeper';
import { OUT_OF_ROOM_LINE, RAN_OUT_LINE, WINDOW_LINE } from '../../lib/alert-pictures/words';
import { ProblemGlyph } from './Glyphs';

export function ListLine() {
  const line = useListLine();
  return (
    <div className="alert-list-line" role="status" aria-live="polite">
      {line === 'ran-out' && <p className="alert-list-line__words alert-pictures-quiet">{RAN_OUT_LINE}</p>}
      {line === 'out-of-room' && (
        <p className="alert-list-line__words alert-pictures-problem">
          <ProblemGlyph />
          <span>{OUT_OF_ROOM_LINE}</span>
        </p>
      )}
      {/* A person may have chosen a private window: the line stands in the ink with no problem glyph. */}
      {line === 'window' && <p className="alert-list-line__words">{WINDOW_LINE}</p>}
    </div>
  );
}

export default ListLine;
