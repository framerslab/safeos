/** @jest-environment jsdom */
/**
 * Settings opens on its list
 *
 * On a phone the look row and the Help row stand first; then the heading,
 * its line and the list of settings pages. There is no Save Changes key and
 * no panel: every value saves the moment it moves. A browser that refuses
 * storage is told so at the top.
 */

import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import './helpers/browser-data';
import SettingsPage from '@/app/settings/page';

jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }),
}));

const LINE = 'Kept on this device. A change saves the moment you make it.';
const NOT_KEEPING = 'This browser is not keeping settings. Changes last until you close this tab.';

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

it('opens on the look row, the Help row, the heading and the list, with no Save Changes', async () => {
  const { container } = render(<SettingsPage />);
  await settle();
  const look = screen.getByRole('button', { name: /^Switch to the (light|dark) look$/ });
  const help = screen.getByRole('link', { name: 'Help' });
  const heading = screen.getByRole('heading', { level: 1, name: 'Settings' });
  const list = screen.getByRole('navigation', { name: 'Settings pages' });
  const order = [look, help, heading, list];
  for (let i = 1; i < order.length; i += 1) {
    expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  expect(screen.getByText(LINE)).toBeTruthy();
  expect(within(list).getAllByRole('link')).toHaveLength(10);
  expect(container.querySelector('.settings.look-part .settings-page')).toBeTruthy();
  for (const gone of ['Save Changes', 'General', 'Alerts', 'Privacy', 'Clear All Local Data']) {
    expect(screen.queryByRole('button', { name: gone })).toBeNull();
  }
  expect(screen.queryByText('Display Name')).toBeNull();
  expect(screen.queryByText(NOT_KEEPING)).toBeNull();
});

it('says the browser is not keeping settings when it refuses storage', async () => {
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('refused', 'SecurityError');
  });
  render(<SettingsPage />);
  await settle();
  expect(screen.getByText(NOT_KEEPING)).toBeTruthy();
  // Every row still opens its page.
  expect(within(screen.getByRole('navigation', { name: 'Settings pages' })).getAllByRole('link')).toHaveLength(10);
});
