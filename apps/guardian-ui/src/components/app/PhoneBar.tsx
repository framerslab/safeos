/**
 * The phone bar
 *
 * At the foot of a phone's screen on every app page but Setup: three places,
 * Dashboard, History and Settings, each a glyph over its word. The place of
 * the page being read is marked with a short accent line along its top, and
 * History carries the count of new alerts. It is in the served HTML, so it
 * shows and works before script runs.
 *
 * @module components/app/PhoneBar
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DESTINATIONS, barePath, destinationOf } from '@/lib/app-routes';
import { IconHome, IconHistory, IconSettings } from '../icons';
import { NewAlertsCount, historyName } from './NewAlertsCount';

const GLYPHS = { '/dashboard': IconHome, '/history': IconHistory, '/settings': IconSettings } as const;
type BarSection = keyof typeof GLYPHS;

export function PhoneBar({ newAlerts = 0 }: { newAlerts?: number }) {
  const pathname = usePathname();
  const current = destinationOf(pathname);
  return (
    <nav aria-label="App" className="phone-bar look-part">
      {DESTINATIONS.filter((d) => d.section in GLYPHS).map((d) => {
        const Glyph = GLYPHS[d.section as BarSection];
        const counted = d.section === '/history' && newAlerts > 0;
        return (
          <Link
            key={d.href}
            href={d.href}
            className="phone-bar__place"
            aria-current={current === d.section ? 'page' : undefined}
            aria-label={counted ? historyName(newAlerts) : undefined}
            // A press on the place of the page being read returns that page to its top.
            onClick={barePath(pathname) === d.section ? () => window.scrollTo(0, 0) : undefined}
          >
            <span className="phone-bar__glyph" aria-hidden="true">
              <Glyph size={24} />
            </span>
            <span className="phone-bar__word">
              {d.label}
              {d.section === '/history' && <NewAlertsCount count={newAlerts} />}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default PhoneBar;
