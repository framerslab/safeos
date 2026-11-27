/** @jest-environment jsdom */
/**
 * Help's two entries an address opens
 *
 * The dashboard links to /help/#camera and /help/#notifications when the
 * camera or notifications are blocked. Help opens Troubleshooting with that
 * entry in view; any other address opens the page as before. Getting started
 * is in Help itself: no section holds a key to the old tip walk, whose
 * address forwards to Help.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import HelpPage from '@/app/help/page';

/** An address without its trailing slash: next/link drops it outside a build. */
const bare = (address: string | null | undefined) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

const scrolled: Element[] = [];
const original = Element.prototype.scrollIntoView;

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = jest.fn(function (this: Element) {
    scrolled.push(this);
  });
  window.history.replaceState(null, '', '/help/');
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = original;
  window.history.replaceState(null, '', '/');
});

function opensAt(hash: string, heading: string, id: string) {
  window.history.replaceState(null, '', `/help/${hash}`);
  render(<HelpPage />);
  const title = screen.getByRole('heading', { name: heading });
  const entry = title.closest(`#${id}`);
  expect(entry).not.toBeNull();
  expect(scrolled).toContain(entry);
}

it("opens Troubleshooting at the camera's entry for an address that names it", () => {
  opensAt('#camera', 'Camera not working', 'camera');
});

it('opens it at the notifications entry', () => {
  opensAt('#notifications', 'Notifications not appearing', 'notifications');
});

it('follows a change of the address', () => {
  render(<HelpPage />);
  expect(screen.getByRole('heading', { name: 'Getting Started with SafeOS' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Camera not working' })).toBeNull();

  act(() => {
    window.history.replaceState(null, '', '/help/#camera');
    window.dispatchEvent(new Event('hashchange'));
  });

  const entry = screen.getByRole('heading', { name: 'Camera not working' }).closest('#camera');
  expect(entry).not.toBeNull();
  expect(scrolled).toContain(entry);
});

it('any other fragment opens the page as before', () => {
  window.history.replaceState(null, '', '/help/#faq');
  render(<HelpPage />);
  expect(screen.getByRole('heading', { name: 'Getting Started with SafeOS' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Camera not working' })).toBeNull();
  expect(scrolled).toEqual([]);
});

it('holds no key to the tip walk in any section', () => {
  render(<HelpPage />);
  for (const section of ['Getting Started', 'FAQ', 'Keyboard Shortcuts', 'Troubleshooting', 'Contact Support']) {
    fireEvent.click(screen.getByRole('button', { name: section }));
    expect([section, screen.queryAllByText('Start Interactive Tutorial').length]).toEqual([section, 0]);
    const links = screen.queryAllByRole('link').map((link) => bare(link.getAttribute('href')));
    expect([section, links.filter((href) => href === '/tutorial')]).toEqual([section, []]);
  }
});

it('forgets the entry when the address moves to another fragment, so a later Troubleshooting opens at its top', () => {
  window.history.replaceState(null, '', '/help/#camera');
  render(<HelpPage />);
  scrolled.length = 0;

  act(() => {
    window.history.replaceState(null, '', '/help/#main-content');
    window.dispatchEvent(new Event('hashchange'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
  fireEvent.click(screen.getByRole('button', { name: 'Troubleshooting' }));

  const camera = screen.getByRole('heading', { name: 'Camera not working' }).closest('#camera');
  expect(scrolled).not.toContain(camera);
});

it('Getting Started leads to setup, which turns on the camera and the microphone together, and then to Start watching', () => {
  render(<HelpPage />);
  const steps = screen.getByRole('heading', { name: 'Getting Started with SafeOS' }).parentElement as HTMLElement;
  const links = Array.from(steps.querySelectorAll('a')).map((link) => bare(link.getAttribute('href')));
  expect(links).toContain('/setup');
  expect(steps.textContent).toMatch(/Turn on the camera, then allow the camera and microphone/);
  expect(steps.textContent).not.toMatch(/optionally microphone/);
  expect(steps.textContent).toMatch(/Start watching/);
  expect(steps.textContent).not.toMatch(/Click "Start Monitoring"/);
});

it("puts the browser's own setting for this site first in the camera and notifications entries", () => {
  window.history.replaceState(null, '', '/help/#camera');
  render(<HelpPage />);
  const firstStep = (id: string) => document.querySelector(`#${id} li`)?.textContent ?? '';
  expect(firstStep('camera')).toMatch(/site settings.*Camera.*Allow/);
  expect(firstStep('notifications')).toMatch(/site settings.*Notifications.*Allow/);
});
