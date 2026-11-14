/**
 * Visitor header
 *
 * The header of the home page and the other public pages: the mark and the
 * wordmark, four destinations, the look switch and the start key, in one row
 * at every width from 320 px. On a phone, and whenever the links do not fit
 * the row (a narrow window or larger text), the links and the start key are
 * rows of the Menu. Before script runs every link works and Menu is a link to
 * the footer's links. App screens keep their own header (layout/Nav).
 *
 * @module components/visitor/VisitorHeader
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { barePath } from '@/lib/visitor-routes';
import { useSetupDone } from '@/lib/use-setup-done';
import { SiteMark } from './SiteMark';
import { LookSwitch } from './LookSwitch';
import { StartLink } from './StartLink';

export const GITHUB_URL = 'https://github.com/framerslab/safeos';

const LINKS: { href: string; label: string; page?: string }[] = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#uses', label: 'Uses' },
  { href: '/privacy/', label: 'Privacy', page: '/privacy' },
  { href: '/faq/', label: 'FAQ', page: '/faq' },
];

// What takes focus when pressed and can be reached with Tab. The main content
// takes focus on a press too (its tabindex of -1 lets the skip link move focus
// there), but a press on it counts as a press on the page.
const TAKES_FOCUS =
  'a[href], button, input, select, textarea, summary, label, iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"]), [contenteditable]';

export function VisitorHeader() {
  const pathname = barePath(usePathname());
  const isHome = pathname === '/';
  const setupDone = useSetupDone();
  const [scriptArrived, setScriptArrived] = useState(false);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [compact, setCompact] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const menuKeyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setScriptArrived(true);
  }, []);

  // Closing the Menu, by Escape, by a press outside or by one of its rows,
  // puts focus back on the Menu key.
  const closeMenu = useCallback(() => {
    setOpen(false);
    menuKeyRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (!navRef.current || !(target instanceof Node) || navRef.current.contains(target)) return;
      closeMenu();
      // The browser moves focus as part of the press, after this listener:
      // to what was pressed when that takes focus, otherwise to the page. A
      // press on the page puts focus back on the Menu key once it has ended;
      // a press that never ends in a click (a scroll) gives up after a second.
      if (target instanceof Element && target.closest(TAKES_FOCUS)) return;
      let timer = 0;
      const refocus = () => {
        window.clearTimeout(timer);
        document.removeEventListener('click', refocus, true);
        menuKeyRef.current?.focus();
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
  }, [open, closeMenu]);

  // A new page starts with the Menu closed.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // No line under the bar in the first screen; a line once the page has
  // moved under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The links and the start key join the row only while the row holds them.
  // The row is measured as it would be with them in it; when it overflows
  // (a narrow window or larger text) they stay in the Menu. When even the
  // mark, the wordmark, the look switch and Menu overflow (much larger text
  // on a phone), the wordmark leaves the row; the link keeps its name.
  useEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar) return;
    const measure = () => {
      const wasCollapsed = nav.getAttribute('data-collapsed');
      const wasCompact = nav.getAttribute('data-compact');
      const overflows = () => bar.scrollWidth > bar.clientWidth + 0.5;
      nav.removeAttribute('data-collapsed');
      nav.removeAttribute('data-compact');
      const rowOverflows = overflows();
      let menuRowOverflows = false;
      if (rowOverflows) {
        nav.setAttribute('data-collapsed', 'true');
        menuRowOverflows = overflows();
      }
      if (wasCollapsed !== null) nav.setAttribute('data-collapsed', wasCollapsed);
      else nav.removeAttribute('data-collapsed');
      if (wasCompact !== null) nav.setAttribute('data-compact', wasCompact);
      setCollapsed(rowOverflows);
      setCompact(menuRowOverflows);
      // From the tablet width a row that holds the links shows no Menu and
      // no Menu key: an open one closes, so it does not come back when the
      // window narrows, and focus inside it or on its key moves to the start
      // key in the row.
      if (!rowOverflows && window.matchMedia?.('(min-width: 48em)').matches) {
        const focused = document.activeElement;
        const onMenuKey = !!menuKeyRef.current && focused === menuKeyRef.current;
        if (onMenuKey || nav.querySelector('#site-menu')?.contains(focused)) {
          nav.removeAttribute('data-collapsed');
          nav.querySelector<HTMLElement>('.site-header__start')?.focus();
        }
        setOpen(false);
      }
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
  }, [setupDone, scriptArrived]);

  // With the row able to hold the links again, an open Menu has nothing to
  // show that the row does not.
  const menuInUse = open && scriptArrived;

  return (
    <nav
      ref={navRef}
      aria-label="Site"
      className="site-header"
      data-script={scriptArrived ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      data-compact={compact ? 'true' : undefined}
      data-scrolled={scrolled ? 'true' : undefined}
    >
      <div ref={barRef} className="site-header__bar">
        <Link
          href="/"
          className="site-header__brand"
          aria-label="SafeOS Guardian, home"
          aria-current={isHome ? 'page' : undefined}
          onClick={isHome ? () => window.scrollTo(0, 0) : undefined}
        >
          <SiteMark />
          <span className="wordmark" translate="no">
            <span className="wordmark__first">SafeOS</span>
            <span className="wordmark__second">Guardian</span>
          </span>
        </Link>

        <div className="site-header__links">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="site-header__link"
              aria-current={link.page && pathname === link.page ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="site-header__actions">
          <a href={GITHUB_URL} className="site-header__link site-header__github" aria-label="SafeOS on GitHub">
            <span translate="no">GitHub</span>
          </a>
          <LookSwitch />
          <StartLink className="key key--solid site-header__start" />
          {scriptArrived ? (
            <button
              ref={menuKeyRef}
              type="button"
              className="site-header__menu-key"
              aria-label={menuInUse ? 'Close menu' : 'Menu'}
              aria-expanded={menuInUse}
              aria-controls="site-menu"
              onClick={() => (menuInUse ? closeMenu() : setOpen(true))}
            >
              <span className="menu-key__words">
                <span aria-hidden={menuInUse ? 'true' : undefined}>Menu</span>
                <span aria-hidden={menuInUse ? undefined : 'true'}>Close</span>
              </span>
            </button>
          ) : (
            <a href="#site-links" className="site-header__menu-key">
              Menu
            </a>
          )}
        </div>
      </div>

      <div id="site-menu" className="site-menu" hidden={!menuInUse}>
        <StartLink className="site-menu__row site-menu__row--start" onClick={closeMenu} />
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="site-menu__row"
            aria-current={link.page && pathname === link.page ? 'page' : undefined}
            onClick={closeMenu}
          >
            {link.label}
          </Link>
        ))}
        <a href={GITHUB_URL} className="site-menu__row" aria-label="SafeOS on GitHub" onClick={closeMenu}>
          <span translate="no">GitHub</span>
        </a>
      </div>
    </nav>
  );
}

export default VisitorHeader;
