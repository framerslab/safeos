'use client';

/**
 * The line at the top of Settings while this browser refuses its storage,
 * read once by a polite status.
 *
 * @module components/settings/StorageLine
 */

import { useEffect, useState } from 'react';
import { writeRefused } from '@/lib/settings-save';
import { ProblemGlyph } from './glyphs';

export const NOT_KEEPING = 'This browser is not keeping settings. Changes last until you close this tab.';

export function StorageLine() {
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setRefused(writeRefused());
  }, []);

  return (
    <div className="set-storage" role="status" aria-live="polite">
      {refused ? (
        <p className="set-storage__line">
          <ProblemGlyph />
          {NOT_KEEPING}
        </p>
      ) : null}
    </div>
  );
}

export default StorageLine;
