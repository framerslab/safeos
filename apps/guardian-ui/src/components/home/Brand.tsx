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

export function Brand({ children }: { children: React.ReactNode }) {
  return <span translate="no">{children}</span>;
}

export default Brand;
