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
import { bare } from './helpers/served-html';

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
