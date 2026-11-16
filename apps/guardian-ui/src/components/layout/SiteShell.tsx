/**
 * Site shell
 *
 * Chooses the frame by route (lib/app-routes). The home page and the other
 * pages a visitor reads get the visitor header and footer. Every app page
 * gets the app's header, the same site footer and, on a phone, the bar at
 * the foot of the screen (on every app page but Setup). A page built in the
 * readable look is marked so its whole body follows the device's light or
 * dark setting before script runs; on the other app pages the header, the
 * footer's wrapper and the bar carry the look themselves. No page mounts a
 * notification card or an install sheet.
 *
 * Once its script has started, the shell marks the document, which hides the
 * line for a page whose script did not start.
 *
 * @module components/layout/SiteShell
 */

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppHeader } from '../app/AppHeader';
import { PhoneBar } from '../app/PhoneBar';
import { VisitorHeader } from '../visitor/VisitorHeader';
import { VisitorFooter } from '../visitor/VisitorFooter';
import { StatusBanner } from '../StatusBanner';
import { isAppRoute, isLookBuiltRoute, showsPhoneBar } from '@/lib/app-routes';
import { isHomeRoute } from '@/lib/visitor-routes';

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.setAttribute('data-app-started', 'true');
  }, []);

  if (!isAppRoute(pathname)) {
    return (
      <div className={isHomeRoute(pathname) ? 'visitor-shell device-look' : 'visitor-shell'}>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <VisitorHeader />
        <div id="main-content" className="visitor-content" tabIndex={-1}>
          {/* Rendered here so it sits below the fixed header, not behind it. */}
          <StatusBanner />
          {children}
        </div>
        <VisitorFooter />
      </div>
    );
  }

  const look = isLookBuiltRoute(pathname);
  const bar = showsPhoneBar(pathname);
  return (
    <div className={`app-shell${look ? ' app-shell--look look-part' : ''}${bar ? ' app-shell--bar' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <AppHeader />
      <div id="main-content" className="app-content" tabIndex={-1}>
        <StatusBanner />
        {children}
      </div>
      <div className="app-shell__footer look-part">
        <VisitorFooter />
      </div>
      {bar && <PhoneBar />}
    </div>
  );
}

export default SiteShell;
