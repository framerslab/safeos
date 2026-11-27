/**
 * The look row
 *
 * The row that switches the look, where a phone's top bar has no room for
 * the switch: Settings' first row and the foot of setup's column. Before
 * script runs only its place is held, so nothing moves when it appears; then
 * it is a button named for what a press does, and a status says the look now
 * on. `rowClass` is the row's own class, so each page keeps its own row style.
 *
 * @module components/app/LookRow
 */

'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-manager';
import { Moon, Sun } from '../visitor/LookSwitch';

/** The row that switches the look: a place held before script, then a button named for what a press does, and a status that says the look now on. */
export function LookRow({ rowClass }: { rowClass: string }) {
  const { isDark, toggleTheme } = useTheme();
  const [arrived, setArrived] = useState(false);
  const [said, setSaid] = useState('');

  useEffect(() => {
    setArrived(true);
  }, []);

  const press = () => {
    const next = isDark ? 'light' : 'dark';
    try {
      toggleTheme();
    } catch {
      // The browser refused to store the choice: the look changes for this
      // visit, and the next visit follows the device.
    }
    setSaid(next === 'dark' ? 'Dark look on' : 'Light look on');
  };

  return (
    <>
      {arrived ? (
        <button type="button" className={rowClass} onClick={press}>
          <span className={`${rowClass}__glyph`} aria-hidden="true">
            {isDark ? <Sun /> : <Moon />}
          </span>
          <span>{isDark ? 'Switch to the light look' : 'Switch to the dark look'}</span>
        </button>
      ) : (
        <span className={`${rowClass} ${rowClass}--place`} aria-hidden="true" />
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}

export default LookRow;
