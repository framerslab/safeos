/**
 * The question before a second watch
 *
 * "Watch here instead? The other tab stops." with Watch here and the key that
 * keeps the other tab: Cancel, or the words the page gives (`keep`). Focus
 * starts on that key, the choice that changes nothing, and stays inside the
 * dialog until a choice or Escape.
 *
 * @module components/dashboard/OtherTabDialog
 */

'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { KeyRow } from '@/components/KeyRow';

export function OtherTabDialog({ onWatchHere, onCancel, keep = 'Cancel' }: { onWatchHere: () => void; onCancel: () => void; keep?: string }) {
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
    // Tab and Shift+Tab go round the dialog's keys, never out: its two
    // choices, and the row's arrows while it scrolls.
    event.preventDefault();
    const keys = Array.from(event.currentTarget.querySelectorAll('button'));
    const at = keys.indexOf(document.activeElement as HTMLButtonElement);
    keys[(at + (event.shiftKey ? -1 : 1) + keys.length) % keys.length]?.focus();
  };

  return (
    <div className="app-dialog__veil look-part">
      <div className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="other-tab-question" onKeyDown={onKeyDown}>
        <p id="other-tab-question" className="app-dialog__question">Watch here instead? The other tab stops.</p>
        <KeyRow className="app-dialog__keys">
          <button type="button" className="key key--outline" onClick={onWatchHere}>Watch here</button>
          <button ref={cancelRef} type="button" className="key key--outline" onClick={onCancel}>{keep}</button>
        </KeyRow>
      </div>
    </div>
  );
}
