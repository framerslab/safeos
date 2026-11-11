/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsProvider } from '@/components/KeyboardShortcutsProvider';
import SecurityPage from '@/app/security/page';
import { useMonitoringStore } from '@/stores/monitoring-store';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@tensorflow/tfjs', () => ({ ready: async () => {}, setBackend: async () => true }));
jest.mock('@tensorflow-models/coco-ssd', () => ({ load: async () => ({ detect: async () => [] }) }));

it('leaves Space on the security arm button to native button activation', async () => {
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  useMonitoringStore.setState({ isStreaming: false });
  render(<KeyboardShortcutsProvider><SecurityPage /></KeyboardShortcutsProvider>);
  const arm = await screen.findByRole('button', { name: /arm system/i });
  arm.focus();
  expect(fireEvent.keyDown(arm, { key: ' ', code: 'Space', bubbles: true, cancelable: true })).toBe(true);
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
});

it('opens shortcut help from a focused button and closes it with Escape', async () => {
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  render(<KeyboardShortcutsProvider><button>Keep focus</button></KeyboardShortcutsProvider>);
  const button = screen.getByRole('button', { name: 'Keep focus' });
  button.focus();
  fireEvent.keyDown(button, { key: '?', bubbles: true });
  expect(await screen.findByRole('heading', { name: 'Keyboard Shortcuts' })).toBeTruthy();
  const close = screen.getByRole('button', { name: /close/i });
  close.focus();
  fireEvent.keyDown(close, { key: 'Escape', bubbles: true });
  expect(screen.queryByRole('heading', { name: 'Keyboard Shortcuts' })).toBeNull();
});
