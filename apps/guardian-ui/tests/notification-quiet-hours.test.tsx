/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Page from '@/app/settings/notifications/page';
import SettingsPage from '@/app/settings/page';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

it('saves notification quiet hours to the monitoring settings and reads them on return', async () => {
  localStorage.clear();
  useAuthStore.setState({ profile: null });
  useSettingsStore.getState().resetToDefaults();
  const view = render(<Page />);
  fireEvent.click(await screen.findByRole('switch', { name: /enable quiet hours/i }));
  fireEvent.change(screen.getByLabelText('Start'), { target: { value: '20:15' } });
  fireEvent.change(screen.getByLabelText('End'), { target: { value: '08:45' } });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await screen.findByText('Notification settings saved.');
  expect(useSettingsStore.getState().quietHoursSettings).toEqual(expect.objectContaining({ enabled: true, startTime: '20:15', endTime: '08:45' }));
  view.unmount();
  useSettingsStore.getState().updateQuietHoursSettings({ startTime: '21:30' });
  render(<Page />);
  expect((await screen.findByLabelText('Start') as HTMLInputElement).value).toBe('21:30');
});
