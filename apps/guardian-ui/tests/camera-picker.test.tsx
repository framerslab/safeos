/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { CameraPicker } from '@/components/CameraPicker';
import { useCameraStore } from '@/stores/camera-store';
import { installCameraBrowser } from './helpers/camera-browser';

afterEach(() => { cleanup(); jest.restoreAllMocks(); });
it('keeps saved camera availability unknown when the browser hides device identities', async () => {
  const browser = installCameraBrowser();
  useCameraStore.getState().setDeviceId('usb');
  browser.mediaDevices.enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: '', label: '' }]);
  render(<CameraPicker />);
  await act(async () => {});
  expect(screen.queryByText('Saved camera (unavailable)')).toBeNull();
  expect((screen.getByRole('combobox', { name: 'Camera' }) as HTMLSelectElement).value).toBe('usb');
  expect(screen.getByText(/Camera names may appear after access is granted/)).toBeTruthy();
});
