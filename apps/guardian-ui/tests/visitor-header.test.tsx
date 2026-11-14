/** @jest-environment jsdom */
/**
 * The visitor header once its script runs
 *
 * Menu becomes a key that opens a panel of rows and closes on Escape or a
 * press outside, with focus back on the key (feature 2). The look switch
 * appears, switches the whole page at once, says what it did and sets the
 * browser's own bar colour (feature 3). The start links read "Open dashboard"
 * once setup is done on this device (features 2, 5 and 13).
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

describe('feature 2: the Menu', () => {
  it('opens a panel that lists the start link, the four links and GitHub, and shows "Close" named "Close menu"', () => {
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
      'Privacy /privacy',
      'FAQ /faq',
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

  it('closes when one of its rows is pressed', () => {
    const { container } = render(<VisitorHeader />);
    const menu = container.querySelector('#site-menu') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(within(menu).getByRole('link', { name: 'Uses' }));
    expect(menu.hidden).toBe(true);
  });
});

describe('feature 3: look switch', () => {
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

describe('features 2, 5 and 13: the start links once setup is done on this device', () => {
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
