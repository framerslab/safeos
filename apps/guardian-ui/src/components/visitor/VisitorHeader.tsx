/**
 * Visitor header
 *
 * The header of the home page and the other public pages: the mark and the
 * wordmark, four links with Privacy as the fifth from 1024 px, GitHub with
 * its star count from 1024 px, the look switch and the start key, in one row
 * at every width from 320 px. On a phone, and whenever the links do not fit
 * the row (a narrow window or larger text), the links and the start key are
 * rows of the Menu. Before script runs every link works and Menu is a link to
 * the footer's links. App pages carry the app's header (components/app).
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
import { GitHubLink, GITHUB_URL } from './GitHubLink';

export { GITHUB_URL };

interface HeaderLink {
  href: string;
  label: string;
  /** The page on which the link is marked as the page being read. */
  page?: string;
  /** In the row from 1024 px only; under that the footer and the Menu hold it. */
  wide?: boolean;
}

// The row's links, in the order a first visit needs them.
const LINKS: HeaderLink[] = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#uses', label: 'Uses' },
  { href: '/tutorials/', label: 'Guides', page: '/tutorials' },
  { href: '/faq/', label: 'FAQ', page: '/faq' },
  { href: '/privacy/', label: 'Privacy', page: '/privacy', wide: true },
];

// The Menu's rows after the start key: the row's links, then the two pages
// the row has no room for. GitHub with its count is the last row.
const MENU_LINKS: HeaderLink[] = [
  ...LINKS,
  { href: '/about/', label: 'About SafeOS', page: '/about' },
  { href: '/blog/', label: 'Blog', page: '/blog' },
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
  // 'small': the wordmark keeps its own size; 'true': the wordmark leaves the row.
  const [compact, setCompact] = useState<'small' | 'true' | null>(null);
  // 'github': GitHub has left a row that ran short; 'privacy': Privacy has too.
  const [short, setShort] = useState<'github' | 'privacy' | null>(null);
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
  // on a phone), the wordmark keeps its own size; when that still overflows,
  // the wordmark leaves the row and the link keeps its name.
  useEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar) return;
    const measure = () => {
      const wasCollapsed = nav.getAttribute('data-collapsed');
      const wasCompact = nav.getAttribute('data-compact');
      const wasShort = nav.getAttribute('data-short');
      const overflows = () => bar.scrollWidth > bar.clientWidth + 0.5;
      nav.removeAttribute('data-collapsed');
      nav.removeAttribute('data-compact');
      nav.removeAttribute('data-short');
      // A row that runs short gives up GitHub first, then Privacy: the footer
      // holds both at every width. Only a row that is short without them
      // moves its links and the start key into the Menu.
      let shortRow: 'github' | 'privacy' | null = null;
      for (const leaves of ['github', 'privacy'] as const) {
        if (!overflows()) break;
        nav.setAttribute('data-short', leaves);
        shortRow = leaves;
      }
      const rowOverflows = overflows();
      if (rowOverflows) {
        nav.removeAttribute('data-short');
        shortRow = null;
      }
      let compactRow: 'small' | 'true' | null = null;
      if (rowOverflows) {
        nav.setAttribute('data-collapsed', 'true');
        if (overflows()) {
          nav.setAttribute('data-compact', 'small');
          compactRow = overflows() ? 'true' : 'small';
        }
      }
      if (wasCollapsed !== null) nav.setAttribute('data-collapsed', wasCollapsed);
      else nav.removeAttribute('data-collapsed');
      if (wasCompact !== null) nav.setAttribute('data-compact', wasCompact);
      else nav.removeAttribute('data-compact');
      if (wasShort !== null) nav.setAttribute('data-short', wasShort);
      else nav.removeAttribute('data-short');
      setCollapsed(rowOverflows);
      setCompact(compactRow);
      setShort(shortRow);
      // A link the short row gives up cannot keep focus: focus moves to the
      // start key in the row. The footer holds both links at every width.
      if (shortRow) {
        const focused = document.activeElement;
        const givenUp = focused instanceof HTMLElement && nav.contains(focused)
          && (!!focused.closest('.site-header__github') || (shortRow === 'privacy' && !!focused.closest('.site-header__link--wide')));
        if (givenUp) nav.querySelector<HTMLElement>('.site-header__start')?.focus();
      }
      // A row that collapses hides its links, GitHub and the start key: focus
      // on one of them moves to the Menu key, which shows with the collapsed row.
      if (rowOverflows && menuKeyRef.current) {
        const focused = document.activeElement;
        const hidden = focused instanceof HTMLElement && nav.contains(focused)
          && !!focused.closest('.site-header__links, .site-header__github, .site-header__start');
        if (hidden) {
          nav.setAttribute('data-collapsed', 'true');
          menuKeyRef.current.focus();
        }
      }
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

  const brand = (
    <>
      <SiteMark />
      <span className="wordmark" translate="no">
        <span className="wordmark__first">SafeOS</span>
        <span className="wordmark__second">Guardian</span>
      </span>
    </>
  );

  return (
    <nav
      ref={navRef}
      aria-label="Site"
      className="site-header"
      data-script={scriptArrived ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      data-compact={compact ?? undefined}
      data-short={short ?? undefined}
      data-scrolled={scrolled ? 'true' : undefined}
    >
      <div ref={barRef} className="site-header__bar">
        {isHome ? (
          <span className="site-header__brand" role="img" aria-label="SafeOS Guardian">{brand}</span>
        ) : (
          <Link href="/" className="site-header__brand" aria-label="SafeOS Guardian, home">{brand}</Link>
        )}

        <div className="site-header__links">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={link.wide ? 'site-header__link site-header__link--wide' : 'site-header__link'}
              aria-current={link.page && pathname === link.page ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="site-header__actions">
          <GitHubLink className="site-header__link site-header__github" place="row" />
          <LookSwitch />
          <StartLink className="key key--solid site-header__start" />
          {scriptArrived ? (
            <button
              ref={menuKeyRef}
              type="button"
              className="key key--word site-header__menu-key"
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
            <a href="#site-links" className="key key--word site-header__menu-key">
              Menu
            </a>
          )}
        </div>
      </div>

      <div id="site-menu" className="site-menu" hidden={!menuInUse}>
        <StartLink className="key key--solid site-menu__start" onClick={closeMenu} />
        {MENU_LINKS.map((link) => (
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
        <GitHubLink className="site-menu__row" place="menu" onClick={closeMenu} />
      </div>
    </nav>
  );
}

export default VisitorHeader;
