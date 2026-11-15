/**
 * The app's header
 *
 * One row on every app page: the mark and the wordmark as a link to the
 * dashboard, then a navigation named "App" with the four destinations
 * (Dashboard, History, Settings and Help) and the look switch. On a phone the
 * row shows the brand alone, plain, and the bar at the foot of the screen
 * carries the destinations. When the row runs short (a narrow window or
 * larger text) it folds: the wordmark leaves first, then Help moves into
 * More, then Settings, and only when nothing else is left does the row scroll
 * inside itself. Before script runs every link works and the look switch has
 * only its place held.
 *
 * @module components/app/AppHeader
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DESTINATIONS, destinationOf, type Destination } from '@/lib/app-routes';
import { SiteMark } from '../visitor/SiteMark';
import { LookSwitch } from '../visitor/LookSwitch';
import { NewAlertsCount, historyName } from './NewAlertsCount';

/** How far the row folds: 0 whole; 1 the wordmark leaves; 2 Help is in More; 3 Settings too; 4 as 3, and the row scrolls inside itself. */
export type Fold = 0 | 1 | 2 | 3 | 4;

// The fold from which each destination sits in More instead of the row.
const MOVES: Record<string, Fold> = { '/help': 2, '/settings': 3 };

// What takes focus when pressed and can be reached with Tab. The main content
// takes focus on a press too (its tabindex of -1 lets the skip link move focus
// there), but a press on it counts as a press on the page.
const TAKES_FOCUS =
  'a[href], button, input, select, textarea, summary, label, iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"]), [contenteditable]';

/** The first fold at which the row holds its items; 4 when none does. */
export function foldFor(overflowsAt: (fold: Fold) => boolean): Fold {
  for (const fold of [0, 1, 2, 3] as Fold[]) if (!overflowsAt(fold)) return fold;
  return 4;
}

function Wordmark() {
  return (
    <span className="wordmark" translate="no">
      <span className="wordmark__first">SafeOS</span>
      <span className="wordmark__second">Guardian</span>
    </span>
  );
}

export function AppHeader({ newAlerts = 0 }: { newAlerts?: number }) {
  const pathname = usePathname();
  const current = destinationOf(pathname);
  const [fold, setFold] = useState<Fold>(0);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  // Closing More, by Escape, by a press outside or by one of its rows, puts
  // focus back on the More key.
  const close = useCallback(() => {
    setOpen(false);
    moreRef.current?.focus();
  }, []);

  // No line under the bar in the first screen; a line once the page has
  // moved under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The row is measured as it would be at each fold in turn, and takes the
  // first at which it holds its items. It is measured again when the More
  // key comes or goes, since the key takes room in the row. Under fold 2
  // More has nothing to show, and an open one closes.
  useEffect(() => {
    const header = headerRef.current;
    const bar = barRef.current;
    if (!header || !bar) return;
    const measure = () => {
      const was = header.getAttribute('data-fold');
      const next = foldFor((at) => {
        header.setAttribute('data-fold', String(at));
        return bar.scrollWidth > bar.clientWidth + 0.5;
      });
      if (was !== null) header.setAttribute('data-fold', was);
      else header.removeAttribute('data-fold');
      setFold(next);
      if (next < 2) setOpen(false);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(bar);
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure).catch(() => undefined);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [newAlerts, fold]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!headerRef.current || !(target instanceof Node) || headerRef.current.contains(target)) return;
      close();
      // The browser moves focus as part of the press, after this listener:
      // to what was pressed when that takes focus, otherwise to the page. A
      // press on the page puts focus back on the More key once it has ended;
      // a press that never ends in a click (a scroll) gives up after a second.
      if (target instanceof Element && target.closest(TAKES_FOCUS)) return;
      let timer = 0;
      const refocus = () => {
        window.clearTimeout(timer);
        document.removeEventListener('click', refocus, true);
        moreRef.current?.focus();
      };
      timer = window.setTimeout(() => document.removeEventListener('click', refocus, true), 1000);
      document.addEventListener('click', refocus, true);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  const link = (d: Destination, className: string, onClick?: () => void) => (
    <Link
      key={d.href}
      href={d.href}
      className={className}
      data-section={d.section}
      onClick={onClick}
      aria-current={current === d.section ? 'page' : undefined}
      aria-label={d.section === '/history' && newAlerts > 0 ? historyName(newAlerts) : undefined}
    >
      {d.label}
      {d.section === '/history' && <NewAlertsCount count={newAlerts} />}
    </Link>
  );

  return (
    <header ref={headerRef} className="app-header look-part" data-fold={fold} data-scrolled={scrolled ? 'true' : undefined}>
      <div ref={barRef} className="app-header__bar">
        <Link href="/dashboard/" className="app-header__brand app-header__brand--link" aria-label="SafeOS Guardian, dashboard">
          <SiteMark />
          <Wordmark />
        </Link>
        <span className="app-header__brand app-header__brand--plain">
          <SiteMark />
          <span className="sr-only" translate="no">
            SafeOS Guardian
          </span>
          <span aria-hidden="true">
            <Wordmark />
          </span>
        </span>
        <nav aria-label="App" className="app-header__nav">
          <div className="app-header__links">{DESTINATIONS.map((d) => link(d, 'app-header__link'))}</div>
          <div className="app-header__actions">
            {fold >= 2 && (
              <button
                ref={moreRef}
                type="button"
                className="app-header__more"
                aria-expanded={open}
                aria-controls="app-more"
                onClick={() => (open ? close() : setOpen(true))}
              >
                More
              </button>
            )}
            <LookSwitch />
          </div>
        </nav>
      </div>
      <div id="app-more" className="app-more" hidden={!open}>
        {DESTINATIONS.filter((d) => (MOVES[d.section] ?? 9) <= Math.min(fold, 3)).map((d) => link(d, 'app-more__row', close))}
      </div>
    </header>
  );
}

export default AppHeader;
