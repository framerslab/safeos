/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { NotificationPermission } from '@/components/NotificationPermission';
import TestAlertsPage from '@/app/settings/test-alerts/page';
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

it('shows the permission confirmation through the worker on browsers without Notification construction', async () => {
  localStorage.clear();
  jest.useFakeTimers();
  const constructor = jest.fn(() => { throw new TypeError('Illegal constructor'); });
  Object.assign(constructor, { permission: 'default', requestPermission: jest.fn(async () => { Object.assign(constructor, { permission: 'granted' }); return 'granted'; }) });
  Object.defineProperty(window, 'Notification', { configurable: true, value: constructor });
  const showNotification = jest.fn().mockResolvedValue(undefined);
  const registration = { showNotification };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration), getRegistration: async () => registration } });
  render(<NotificationPermission />);
  act(() => jest.advanceTimersByTime(5000));
  fireEvent.click(screen.getByRole('button', { name: /enable/i }));
  await waitFor(() => expect(showNotification).toHaveBeenCalledWith('SafeOS Guardian', expect.objectContaining({ tag: 'permission-granted' })));
  expect(constructor).not.toHaveBeenCalled();
  jest.useRealTimers();
});

it('delivers the settings test alert through the shared notification manager', async () => {
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const constructor = jest.fn(() => { throw new TypeError('Illegal constructor'); });
  Object.assign(constructor, { permission: 'granted' });
  Object.defineProperty(window, 'Notification', { configurable: true, value: constructor });
  const showNotification = jest.fn().mockResolvedValue(undefined);
  const registration = { showNotification };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration), getRegistration: async () => registration } });
  render(<TestAlertsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /test notification/i }));
  await waitFor(() => expect(showNotification).toHaveBeenCalledWith('Test', expect.objectContaining({ body: 'This is a test browser notification' })));
  expect(constructor).not.toHaveBeenCalled();
});
