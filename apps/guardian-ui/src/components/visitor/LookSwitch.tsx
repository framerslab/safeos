/**
 * Look switch
 *
 * Switches the whole site between the light and the dark look and keeps the
 * choice on this device. Until a choice is made the page follows the device's
 * setting. The key's name says what a press does, and each press is announced.
 * Before its script arrives its place is held empty, so nothing moves when it
 * appears; with scripts off the page follows the device through CSS alone.
 *
 * @module components/visitor/LookSwitch
 */

'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme-manager';

function Sun() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LookSwitch() {
  const { isDark, toggleTheme } = useTheme();
  const [arrived, setArrived] = useState(false);
  const [said, setSaid] = useState('');

  useEffect(() => {
    setArrived(true);
  }, []);

  if (!arrived) return <span className="look-switch-place" aria-hidden="true" />;

  const press = () => {
    const next = isDark ? 'light' : 'dark';
    try {
      toggleTheme();
    } catch {
      // The browser refused to store the choice: the look still changes for
      // this visit, and the next visit follows the device.
    }
    setSaid(next === 'dark' ? 'Dark look on' : 'Light look on');
  };

  return (
    <>
      <button
        type="button"
        className="look-switch"
        aria-label={isDark ? 'Switch to the light look' : 'Switch to the dark look'}
        onClick={press}
      >
        {isDark ? <Sun /> : <Moon />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}

export default LookSwitch;
