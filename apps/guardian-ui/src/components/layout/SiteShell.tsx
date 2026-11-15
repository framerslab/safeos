/**
 * Site shell
 *
 * Chooses the header and footer by route. The home page and the other public
 * pages (lib/visitor-routes) get the visitor header and footer; every app
 * screen keeps the app's own header, footer and bottom navigation. The home
 * page shows no notification card and no install sheet: they belong to setup
 * and the app, and wait for the visitor to act.
 *
 * On the other public pages the app's bottom navigation shows on a phone, and
 * the shell marks itself so the footer ends above it.
 *
 * Once its script has started, the shell marks the document, which hides the
 * home page's line for a page whose script did not start.
 *
 * @module components/layout/SiteShell
 */

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Nav } from './Nav';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { VisitorHeader } from '../visitor/VisitorHeader';
import { VisitorFooter } from '../visitor/VisitorFooter';
import { PWAInstallPrompt } from '../PWAInstallPrompt';
import { NotificationPermission } from '../NotificationPermission';
import { StatusBanner } from '../StatusBanner';
import { isHomeRoute, isVisitorRoute } from '@/lib/visitor-routes';

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = isHomeRoute(pathname);

  useEffect(() => {
    document.documentElement.setAttribute('data-app-started', 'true');
  }, []);

  if (isVisitorRoute(pathname)) {
    return (
      <div className={home ? 'visitor-shell device-look' : 'visitor-shell visitor-shell--bottom-nav'}>
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
        {!home && (
          <>
            <MobileBottomNav />
            <PWAInstallPrompt />
            <NotificationPermission />
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <a href="#main-content" className="sr-only sr-only-focusable">
        Skip to content
      </a>
      <Nav />
      <div id="main-content" className="app-content">
        {/* Rendered here (not in Providers) so it sits *below* the
            fixed nav, not behind it. */}
        <StatusBanner />
        {children}
      </div>
      <Footer />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Notification Permission Request */}
      <NotificationPermission />
    </>
  );
}

export default SiteShell;
