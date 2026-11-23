'use client';

/**
 * The line at the top of Settings while this browser refuses its storage, or
 * has refused to keep the settings themselves (a device too full to take
 * them), read once by a polite status. A refusal after the page opened shows
 * it too, and a later write of the settings that is kept takes it away.
 *
 * @module components/settings/StorageLine
 */

import { useEffect, useState } from 'react';
import { SETTINGS_KEY, writeRefused } from '@/lib/settings-save';
import { lastWriteRefused, onWriteRefused } from '@/lib/storage-full';
import { ProblemGlyph } from './glyphs';

export const NOT_KEEPING = 'This browser is not keeping settings. Changes last until you close this tab.';

export function StorageLine() {
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const read = () => setRefused(writeRefused() || lastWriteRefused(SETTINGS_KEY));
    read();
    return onWriteRefused(read);
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
