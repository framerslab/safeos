/**
 * Settings' first two rows on a phone
 *
 * A phone's top bar holds the brand alone, so the look switch and the way to
 * Help stand here, above the page's own sections. From the tablet width the
 * header row carries both and these rows are not shown.
 *
 * @module components/settings/PhoneRows
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme-manager';
import { Moon, Sun } from '../visitor/LookSwitch';
import { StartArrow } from '../visitor/StartLink';

export function PhoneRows() {
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
    <div className="settings-phone-rows look-part">
      {arrived ? (
        <button type="button" className="settings-row" onClick={press}>
          <span className="settings-row__glyph" aria-hidden="true">{isDark ? <Sun /> : <Moon />}</span>
          <span>{isDark ? 'Switch to the light look' : 'Switch to the dark look'}</span>
        </button>
      ) : (
        <span className="settings-row settings-row--place" aria-hidden="true" />
      )}
      <Link href="/help/" className="settings-row">
        <span>Help</span>
        <StartArrow />
      </Link>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}

export default PhoneRows;
