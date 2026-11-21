/** @jest-environment jsdom */
/**
 * The visitor header once its script runs
 *
 * Menu becomes a key that opens a panel of rows and closes on Escape or a
 * press outside, with focus back on the key. The look switch
 * appears, switches the whole page at once, says what it did and sets the
 * browser's own bar colour. The start links read "Open dashboard"
 * once setup is done on this device.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { VisitorHeader } from '@/components/visitor/VisitorHeader';
import { VisitorFooter } from '@/components/visitor/VisitorFooter';
import { HomeStart } from '@/components/home/HomeStart';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useThemeStore } from '@/lib/theme-manager';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// An address without its trailing slash: next/link drops it outside a build.
const path = (link: HTMLElement) => (link.getAttribute('href') || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  useThemeStore.setState({ themeMode: 'system', resolvedTheme: 'light' });
  document.documentElement.className = '';
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
});
afterEach(cleanup);

function finishSetup() {
  act(() => {
    useOnboardingStore.setState({
      isComplete: true,
      selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    });
  });
}

describe('the Menu', () => {
  it('opens a panel that lists the start link, the row\'s five links, About SafeOS, Blog and GitHub, and shows "Close" named "Close menu"', () => {
    const { container } = render(<VisitorHeader />);
    const key = screen.getByRole('button', { name: 'Menu' });
    const menu = container.querySelector('#site-menu') as HTMLElement;
    expect(key.getAttribute('aria-expanded')).toBe('false');
    expect(key.getAttribute('aria-controls')).toBe('site-menu');
    expect(menu.hidden).toBe(true);

    fireEvent.click(key);
    expect(menu.hidden).toBe(false);
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(key.getAttribute('aria-label')).toBe('Close menu');
    // The word shown is "Close"; "Menu" keeps its place so the key keeps one width.
    const shown = Array.from(key.querySelectorAll('.menu-key__words span')).filter((word) => word.getAttribute('aria-hidden') !== 'true');
    expect(shown.map((word) => word.textContent)).toEqual(['Close']);
    expect(key.querySelectorAll('.menu-key__words span')).toHaveLength(2);
    expect(within(menu).getAllByRole('link').map((row) => `${row.textContent} ${path(row)}`)).toEqual([
      'Start setup /setup',
      'How it works /#how-it-works',
      'Uses /#uses',
      'Guides /tutorials',
      'FAQ /faq',
      'Privacy /privacy',
      'About SafeOS /about',
      'Blog /blog',
      'GitHub https://github.com/framerslab/safeos',
    ]);
  });

  it('closes on Escape and on a press outside, each time with focus back on the Menu key', () => {
    const { container } = render(<VisitorHeader />);
    const key = screen.getByRole('button', { name: 'Menu' });
    const menu = container.querySelector('#site-menu') as HTMLElement;

    fireEvent.click(key);
    within(menu).getAllByRole('link')[2].focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
    expect(key.getAttribute('aria-label')).toBe('Menu');

    fireEvent.click(key);
    expect(menu.hidden).toBe(false);
    (document.activeElement as HTMLElement).blur();
    fireEvent.pointerDown(document.body);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(key);

    // A press inside the panel does not close it.
    fireEvent.click(key);
    fireEvent.pointerDown(menu);
    expect(menu.hidden).toBe(false);
  });

  it('keeps focus on the Menu key after a press on the page, which the browser moves to the page on the press', () => {
    const { container } = render(<VisitorHeader />);
    const key = screen.getByRole('button', { name: 'Menu' });
    const menu = container.querySelector('#site-menu') as HTMLElement;

    fireEvent.click(key);
    // A browser's order for a press on the page: pointerdown, then the
    // browser moves focus to the page, then mouseup and click.
    fireEvent.pointerDown(document.body);
    (document.activeElement as HTMLElement).blur();
    fireEvent.mouseUp(document.body);
    fireEvent.click(document.body);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
  });

  it('keeps focus on the Menu key after a press on the main content, which the skip link makes focusable', () => {
    const { container } = render(
      <>
        <VisitorHeader />
        <main id="main-content" tabIndex={-1}>
          <p>SafeOS adds an alert.</p>
        </main>
      </>
    );
    const key = screen.getByRole('button', { name: 'Menu' });
    const menu = container.querySelector('#site-menu') as HTMLElement;
    const words = screen.getByText('SafeOS adds an alert.');

    fireEvent.click(key);
    // The browser focuses the main content on the press: it has a tabindex.
    fireEvent.pointerDown(words);
    (container.querySelector('main') as HTMLElement).focus();
    fireEvent.mouseUp(words);
    fireEvent.click(words);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
  });

  it('leaves focus on what was pressed outside the Menu when that takes focus', () => {
    const { container } = render(
      <>
        <VisitorHeader />
        <button type="button">Elsewhere</button>
      </>
    );
    const key = screen.getByRole('button', { name: 'Menu' });
    const menu = container.querySelector('#site-menu') as HTMLElement;
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });

    fireEvent.click(key);
    fireEvent.pointerDown(elsewhere);
    elsewhere.focus();
    fireEvent.mouseUp(elsewhere);
    fireEvent.click(elsewhere);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('closes when one of its rows is pressed', () => {
    const { container } = render(<VisitorHeader />);
    const menu = container.querySelector('#site-menu') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(within(menu).getByRole('link', { name: 'Uses' }));
    expect(menu.hidden).toBe(true);
  });

  it('closes when the window widens until the row holds the links, and stays closed when it narrows again', () => {
    const { container } = render(<VisitorHeader />);
    const menu = container.querySelector('#site-menu') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    within(menu).getByRole('link', { name: 'Uses' }).focus();

    // A tablet width or wider; jsdom measures no overflow, so the row holds the links.
    const phone = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...phone(query), matches: query.includes('min-width: 48em') })) as typeof window.matchMedia;
    try {
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
    } finally {
      window.matchMedia = phone;
    }
    expect(menu.hidden).toBe(true);
    // Focus leaves the hidden panel for the start key in the row.
    expect(document.activeElement).toBe(container.querySelector('.site-header__start'));

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(menu.hidden).toBe(true);
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus from the Menu key to the start key when the window widens until the row holds the links', () => {
    // The wider row shows no Menu key, so focus cannot stay on it: with the
    // Menu open (opened from the keyboard, focus stays on the key) and with
    // it closed (Escape puts focus back on the key).
    for (const leaveOpen of [true, false]) {
      const { container, unmount } = render(<VisitorHeader />);
      const key = screen.getByRole('button', { name: 'Menu' });
      key.focus();
      fireEvent.click(key);
      if (!leaveOpen) fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.activeElement).toBe(key);

      // A tablet width or wider; jsdom measures no overflow, so the row holds the links.
      const phone = window.matchMedia;
      window.matchMedia = ((query: string) => ({ ...phone(query), matches: query.includes('min-width: 48em') })) as typeof window.matchMedia;
      try {
        act(() => {
          window.dispatchEvent(new Event('resize'));
        });
      } finally {
        window.matchMedia = phone;
      }
      expect((container.querySelector('#site-menu') as HTMLElement).hidden).toBe(true);
      expect(document.activeElement).toBe(container.querySelector('.site-header__start'));
      unmount();
    }
  });
});

describe('look switch', () => {
  it('follows the device until a choice is made, and offers the other look by name', () => {
    render(<VisitorHeader />);
    // tests/setup.ts answers every prefers-color-scheme query with no match: a light device.
    expect(screen.getByRole('button', { name: 'Switch to the dark look' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Switch to the light look' })).toBeNull();
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('switches the whole page at once, says what it did and sets the browser\'s bar colour', () => {
    const bar = document.createElement('meta');
    bar.setAttribute('name', 'theme-color');
    bar.setAttribute('media', '(prefers-color-scheme: light)');
    bar.setAttribute('content', '#f8f9fa');
    document.head.appendChild(bar);
    const { container } = render(<VisitorHeader />);
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark look' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(bar.getAttribute('content')).toBe('#0b131b');
    expect(bar.hasAttribute('media')).toBe(false);
    expect(status.textContent).toBe('Dark look on');
    const key = screen.getByRole('button', { name: 'Switch to the light look' });
    // The sun and the moon are decoration: the key's name carries the meaning.
    expect(key.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(key);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(bar.getAttribute('content')).toBe('#f8f9fa');
    expect(status.textContent).toBe('Light look on');
    expect(screen.getByRole('button', { name: 'Switch to the dark look' })).toBeTruthy();
  });

  it('keeps the choice on this device under the site\'s theme key', () => {
    render(<VisitorHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark look' }));
    const stored = JSON.parse(localStorage.getItem('guardian-theme') || '{}') as { state?: { themeMode?: string } };
    expect(stored.state?.themeMode).toBe('dark');
  });

  it('still changes the look for the visit, with no error, when the browser refuses to store the choice', () => {
    render(<VisitorHeader />);
    const refuse = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const store = jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark look' }))).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: 'Switch to the light look' })).toBeTruthy();
    refuse.mockRestore();
    store.mockRestore();
  });
});

describe('the start links once setup is done on this device', () => {
  it('read "Start setup" on a first visit and "Open dashboard" after setup, in the header, its Menu and the footer', () => {
    const { container } = render(
      <>
        <VisitorHeader />
        <VisitorFooter />
      </>
    );
    const starts = () => [
      container.querySelector('.site-header__start') as HTMLElement,
      container.querySelector('#site-menu a') as HTMLElement,
      container.querySelector('footer nav a') as HTMLElement,
    ];
    expect(starts().map((link) => `${link.textContent} ${path(link)}`)).toEqual(['Start setup /setup', 'Start setup /setup', 'Start setup /setup']);
    finishSetup();
    expect(starts().map((link) => `${link.textContent} ${path(link)}`)).toEqual([
      'Open dashboard /dashboard',
      'Open dashboard /dashboard',
      'Open dashboard /dashboard',
    ]);
  });

  it('show "Open dashboard", "Run setup again" to /setup/?again=1 and the line that setup is done in the first screen', () => {
    const { container } = render(<HomeStart />);
    expect(Array.from(container.querySelectorAll('a')).map((link) => `${link.textContent} ${path(link)}`)).toEqual(['Start setup /setup']);
    expect(screen.queryByText('Setup is done on this device.')).toBeNull();
    finishSetup();
    expect(Array.from(container.querySelectorAll('a')).map((link) => `${link.textContent} ${path(link)}`)).toEqual([
      'Open dashboard /dashboard',
      'Run setup again /setup?again=1',
    ]);
    expect(screen.getByText('Setup is done on this device.')).toBeTruthy();
  });

  it('fall back to "Start setup" when the stored setup state cannot be read', () => {
    const { container } = render(<HomeStart />);
    // A stored state with a part missing: reading it throws.
    act(() => {
      useOnboardingStore.setState({ isComplete: true, selectedScenario: 'pet', acceptedDisclaimers: undefined as never });
    });
    expect(Array.from(container.querySelectorAll('a')).map((link) => link.textContent)).toEqual(['Start setup']);
  });
});

describe('a row that runs short', () => {
  // jsdom lays nothing out, so the row's widths are given here: the row is
  // 1000 px wide, and its contents need 1100 px with every link, 1050 px
  // without GitHub and 990 px without GitHub and Privacy. Before the window
  // narrows, everything fits in 900 px.
  function giveWidths(narrow: () => boolean) {
    const scroll = jest.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      if (!narrow()) return 900;
      const short = this.closest('.site-header')?.getAttribute('data-short');
      return short === 'privacy' ? 990 : short === 'github' ? 1050 : 1100;
    });
    const client = jest.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    return () => {
      scroll.mockRestore();
      client.mockRestore();
    };
  }

  it.each([
    ['Privacy', '.site-header__link--wide'],
    ['GitHub', '.site-header__github'],
  ])('moves focus from %s to the start key when the row gives that link up', (_name, selector) => {
    let narrow = false;
    const restore = giveWidths(() => narrow);
    try {
      const { container } = render(<VisitorHeader />);
      const link = container.querySelector(selector) as HTMLElement;
      link.focus();
      expect(document.activeElement).toBe(link);

      narrow = true;
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(container.querySelector('.site-header')?.getAttribute('data-short')).toBe('privacy');
      expect(document.activeElement).toBe(container.querySelector('.site-header__start'));
    } finally {
      restore();
    }
  });
});
