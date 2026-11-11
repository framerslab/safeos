/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NapPage from '@/app/nap/page';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

it('keeps the nap test camera alive through status rerenders and stops it on unmount', async () => {
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const stop = jest.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  const page = render(<NapPage />);
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Pre-Nap Test' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Start' })[0]);
  await waitFor(() => expect(document.querySelector('video')?.srcObject).toBeTruthy());
  page.rerender(<NapPage />);
  expect(stop).not.toHaveBeenCalled();
  page.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});
