/**
 * A name that stays as it is in a translated page (SafeOS, SafeOS Guardian,
 * Frame, GitHub and the names of other sites).
 *
 * @module components/home/Brand
 */

'use client';

import { useEffect, useRef } from 'react';
import { SiteMark } from '@/components/visitor/SiteMark';

export function HomeLockup() {
  const lockup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncVisibility = () => lockup.current?.toggleAttribute('data-page-hidden', document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  return (
    <div ref={lockup} className="home-lockup" role="img" aria-label="SafeOS Guardian" translate="no">
      <SiteMark />
      <span className="home-lockup__name">SafeOS</span>{' '}
      <span className="home-lockup__line">Guardian</span>
    </div>
  );
}

export function HomeBirdGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 15c5 0 7-2 10-6l2-3a4 4 0 0 1 7 2l2 1-2 1c-1 5-5 8-10 8-4 0-7-1-9-3Z" />
      <path d="M11 18v3m4-4v4m-6 0h8M8 14c3 1 6 0 8-2" />
      <circle cx="18" cy="8" r=".5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Brand({ children }: { children: React.ReactNode }) {
  return <span translate="no">{children}</span>;
}

export default Brand;
