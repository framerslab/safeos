/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SetupPage from '@/app/setup/page';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { installCameraBrowser } from './helpers/camera-browser';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('lets setup choose a camera for the permission check and later monitoring', async () => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  const browser = installCameraBrowser();
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Baby/ }));
  await act(async () => {});
  fireEvent.change(screen.getByRole('combobox', { name: 'Camera' }), { target: { value: 'usb' } });
  fireEvent.click(screen.getByRole('button', { name: /Grant|Enable.*Access/i }));
  await act(async () => {});
  expect(browser.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({
    video: expect.objectContaining({ deviceId: { exact: 'usb' } }),
  }));
  expect(browser.video.stop).toHaveBeenCalled();
});
