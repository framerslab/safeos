/**
 * The count of new alerts on History
 *
 * While alerts are new, History's word is followed by the problem glyph and
 * the number in the ink at weight 700: "History 3", and "History 99+" above
 * 99. The glyph is hidden from assistive technology; the link's name carries
 * the whole count instead. Nothing shows at 0. A rise in the count is said
 * once, from one status region of the frame: "3 new alerts".
 *
 * @module components/app/NewAlertsCount
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { ProblemMark } from '../dashboard/Drawn';

/** "History, 3 new alerts"; "History, 1 new alert". */
export function historyName(count: number): string {
  return `History, ${count} new ${count === 1 ? 'alert' : 'alerts'}`;
}

/** "3 new alerts"; "1 new alert". */
export function newAlertsWords(count: number): string {
  return `${count} new ${count === 1 ? 'alert' : 'alerts'}`;
}

/** A status region no eye sees: says the count once each time it rises after the first read, and nothing when it falls. */
export function NewAlertsSaid({ count, ready }: { count: number; ready: boolean }) {
  const [said, setSaid] = useState('');
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (last.current !== null && count > last.current) setSaid(newAlertsWords(count));
    last.current = count;
  }, [count, ready]);
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {said}
    </span>
  );
}

/** Nothing at 0; else a space, the problem glyph (hidden from assistive technology) and the number, "99+" above 99. */
export function NewAlertsCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      {' '}
      <span className="new-count">
        <ProblemMark />
        <span className="num">{count > 99 ? '99+' : count}</span>
      </span>
    </>
  );
}

export default NewAlertsCount;
