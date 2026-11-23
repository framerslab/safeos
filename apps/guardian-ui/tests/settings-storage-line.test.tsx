/** @jest-environment jsdom */
/**
 * The storage line on every settings page
 *
 * A device too full to keep the settings refuses their write. Every settings
 * page, not the list alone, then says at its top that this browser is not
 * keeping settings, so a switch that moved for the visit does not look kept.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import './helpers/browser-data';
import SettingsLayout from '@/app/settings/layout';
import QuietHoursPage from '@/app/settings/schedule/page';
import { useSettingsStore } from '@/stores/settings-store';
import { forgetStorageFull } from '@/lib/storage-full';

jest.mock('next/navigation', () => ({
  usePathname: () => '/settings/schedule/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOT_KEEPING = 'This browser is not keeping settings. Changes last until you close this tab.';

beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
  forgetStorageFull();
  useSettingsStore.getState().resetToDefaults();
});

it('says on Quiet hours that the browser is not keeping settings once their write is refused', async () => {
  act(() => {
    useSettingsStore.getState().updateQuietHoursSettings({ enabled: true });
  });
  render(
    <SettingsLayout>
      <QuietHoursPage />
    </SettingsLayout>
  );
  await act(async () => {});
  expect(screen.queryByText(NOT_KEEPING)).toBeNull();

  const setItem = localStorage.setItem.bind(localStorage);
  jest.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key === 'safeos-settings') throw new DOMException('full', 'QuotaExceededError');
    setItem(key, value);
  });
  fireEvent.click(screen.getByRole('switch', { name: 'Enable quiet hours' }));
  expect(useSettingsStore.getState().quietHoursSettings.enabled).toBe(false);
  expect(await screen.findByText(NOT_KEEPING)).toBeTruthy();
});
