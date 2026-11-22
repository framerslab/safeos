/**
 * The question before a second watch
 *
 * "Watch here instead? The other tab stops." with Watch here and Cancel. Focus
 * starts on Cancel, the choice that changes nothing, and stays inside the
 * dialog until a choice or Escape.
 *
 * @module components/dashboard/OtherTabDialog
 */

'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

export function OtherTabDialog({ onWatchHere, onCancel }: { onWatchHere: () => void; onCancel: () => void }) {
  const watchRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    // Two keys: Tab and Shift+Tab each move to the other one, never out.
    event.preventDefault();
    const next = document.activeElement === watchRef.current ? cancelRef.current : watchRef.current;
    next?.focus();
  };

  return (
    <div className="app-dialog__veil look-part">
      <div className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="other-tab-question" onKeyDown={onKeyDown}>
        <p id="other-tab-question" className="app-dialog__question">Watch here instead? The other tab stops.</p>
        <div className="app-dialog__keys">
          <button ref={watchRef} type="button" className="key key--outline" onClick={onWatchHere}>Watch here</button>
          <button ref={cancelRef} type="button" className="key key--outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
