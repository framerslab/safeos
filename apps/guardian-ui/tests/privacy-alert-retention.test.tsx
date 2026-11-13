/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPage from '@/app/privacy/page';
it('states who sees saved alerts, the limits, what a clear and a sign-out reach and the tab update guidance', () => {
  const { container } = render(<PrivacyPage />);
  expect(container.textContent).not.toContain('per person');
  expect(container.textContent).not.toContain('moves to the new profile');
  expect(screen.getByText(/Alerts saved in this browser are shown to anyone who uses SafeOS in this browser, until someone signs out or clears local data\./)).toBeTruthy();
  expect(screen.getByText(/A session that expires and is replaced does not change what is shown\./)).toBeTruthy();
  expect(screen.getByText(/Alerts saved before this update stay until you dismiss them or use the existing clear controls, and do not count toward the limits\./)).toBeTruthy();
  expect(screen.getByText(/A SafeOS tab opened before this update keeps the earlier limit until it is closed or reloaded: each monitoring alert it saves leaves only the newest 100 monitoring alerts\./)).toBeTruthy();
  expect(screen.getByText(/New alerts are limited to 100 monitoring alerts and 500 alerts overall in this browser\./)).toBeTruthy();
  expect(screen.getByText(/Acknowledged alerts are removed first, oldest first; if all remaining alerts are unacknowledged, the oldest leave first\./)).toBeTruthy();
  expect(screen.getByText(/Alerts are never removed because of their age\./)).toBeTruthy();
  expect(screen.getByText(/Signing out, in any tab, clears the alerts, frames, recordings and personal settings saved in this browser, for every tab; the server connection is kept\./)).toBeTruthy();
  expect(screen.getByText(/Another tab that is still open may go on showing its alerts until it is reloaded, and it stops receiving alerts from a configured server until then\./)).toBeTruthy();
  expect(screen.getByText(/When SafeOS is updated in another tab, this tab stops saving and asks you to reload\. If an older tab holds the update back, close other SafeOS tabs, then reload this page\./)).toBeTruthy();
  expect(screen.getByText(/While either notice is shown, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved\./)).toBeTruthy();
  expect(screen.getByText(/The notice does not stop alerts from a configured server: the tab keeps the session this browser holds for it and makes no new one, or makes one if it holds none or the server has ended the one it holds\./)).toBeTruthy();
  expect(screen.getByText(/One case differs: a session that ran out on this device just as the notice came is kept, and alerts from a configured server pause in that tab until it is reloaded\./)).toBeTruthy();
  expect(screen.getByText(/Everything already saved comes back as it was after you reload\. If an update of your saved history cannot finish, the page says so; nothing is deleted, and a reload tries again\./)).toBeTruthy();
  expect(screen.getByText(/November 13, 2026/)).toBeTruthy();
});

it('distinguishes browser clearing from records kept on a configured server', () => {
  render(<PrivacyPage />);
  expect(screen.queryByText('All data lives in your browser')).toBeNull();
  expect(screen.queryByText('Delete your browser data = delete everything')).toBeNull();
  expect(screen.getByText(/clearing browser data removes only this device/i)).toBeTruthy();
  expect(screen.getByText(/records on a configured server are not deleted/i)).toBeTruthy();
});
