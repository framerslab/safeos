/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { NotificationPermission } from '@/components/NotificationPermission';
import TestAlertsPage from '@/app/settings/test-alerts/page';
import { useOnboardingStore } from '@/stores/onboarding-store';
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({ useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: '' } }) }));

function finishSetup() {
  useOnboardingStore.setState({
    isComplete: true,
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    selectedScenario: 'pet',
  });
}

it('asks for nothing before setup is finished', () => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  jest.useFakeTimers();
  const constructor = jest.fn();
  Object.assign(constructor, { permission: 'default', requestPermission: jest.fn() });
  Object.defineProperty(window, 'Notification', { configurable: true, value: constructor });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise(() => undefined) } });
  render(<NotificationPermission />);
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.queryByRole('button', { name: /enable/i })).toBeNull();
  jest.useRealTimers();
});

it('shows the permission confirmation through the worker on browsers without Notification construction', async () => {
  localStorage.clear();
  finishSetup();
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

it('focuses the alerting tab without reloading its active camera page', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const client = { url: 'https://guardian.example.test/monitor/', focus: jest.fn().mockResolvedValue(undefined), navigate: jest.fn() };
  const clients = { matchAll: jest.fn().mockResolvedValue([client]), openWindow: jest.fn() };
  const { readFileSync } = require('fs');
  const { runInNewContext } = require('vm');
  runInNewContext(readFileSync(require('path').join(process.cwd(), 'public/sw.js'), 'utf8'), {
    self: { addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; }, location: { origin: 'https://guardian.example.test' } },
    clients, console, URL,
  });
  const constructor = jest.fn(() => { throw new TypeError('Illegal constructor'); });
  Object.assign(constructor, { permission: 'granted' });
  Object.defineProperty(window, 'Notification', { configurable: true, value: constructor });
  const showNotification = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ showNotification }) } });
  render(<TestAlertsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /test notification/i }));
  await waitFor(() => expect(showNotification).toHaveBeenCalled());
  const options = showNotification.mock.calls[0][1];
  expect(options.data).toEqual(expect.objectContaining({ focusOnly: true, url: window.location.href }));
  let clicked: Promise<unknown> = Promise.resolve();
  handlers.notificationclick({ action: '', notification: { data: options.data, close: jest.fn() }, waitUntil: (promise: Promise<unknown>) => { clicked = promise; } });
  await clicked;
  expect(client.focus).toHaveBeenCalled();
  expect(client.navigate).not.toHaveBeenCalled();
  expect(clients.openWindow).not.toHaveBeenCalled();
});
