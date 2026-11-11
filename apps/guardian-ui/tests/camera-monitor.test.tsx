/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MonitorPage from '@/app/monitor/page';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useSettingsStore } from '@/stores/settings-store';
import { BrowserSocket, installCameraBrowser, startMonitoring } from './helpers/camera-browser';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: 'wss://monitor.example.test' } }),
}));

let browser: ReturnType<typeof installCameraBrowser>;
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  useMonitoringStore.getState().reset();
  useSettingsStore.setState({ globalMute: true });
  useSettingsStore.getState().updateGlobalSettings({ processingMode: 'local', analysisInterval: 1 });
  browser = installCameraBrowser();
});
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('keeps captured frames on device in local mode with a connected server', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  act(() => BrowserSocket.instances.at(-1)!.onopen?.());
  await startMonitoring();
  act(() => BrowserSocket.instances.at(-1)!.receive({ type: 'stream-started', payload: { streamId: 'server' } }));
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(browser.readFrame).toHaveBeenCalled();
  expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalled();
  expect(BrowserSocket.instances.flatMap(s => s.sent).filter(m => m.type === 'frame')).toEqual([]);
});

it('stops camera, microphone and frame analysis when monitoring stops', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  fireEvent.click(screen.getByRole('button', { name: 'Stop Monitoring' }));
  expect(browser.video.stop).toHaveBeenCalled();
  expect(browser.audio.stop).toHaveBeenCalled();
  expect(browser.closeAudio).toHaveBeenCalled();
  const reads = browser.readFrame.mock.calls.length;
  act(() => { jest.advanceTimersByTime(2000); });
  expect(browser.readFrame).toHaveBeenCalledTimes(reads);
  expect(screen.queryByText('LIVE')).toBeNull();
});

it.each(['NotAllowedError', 'NotFoundError'])('does not claim monitoring when camera acquisition fails with %s', async (name) => {
  browser.getUserMedia.mockRejectedValue(new DOMException('Camera unavailable', name));
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
  expect(screen.queryByRole('button', { name: 'Stop Monitoring' })).toBeNull();
  expect(screen.getByText('Camera unavailable')).toBeTruthy();
});

it('ends monitoring when its camera is unplugged', async () => {
  render(<MonitorPage />);
  await act(async () => {});
  await startMonitoring();
  act(() => browser.video.end());
  expect(useMonitoringStore.getState().isStreaming).toBe(false);
  expect(screen.queryByText('LIVE')).toBeNull();
  expect(screen.getByText(/camera.*(lost|ended|disconnected)/i)).toBeTruthy();
});
