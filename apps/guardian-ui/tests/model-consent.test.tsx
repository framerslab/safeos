/** @jest-environment ./tests/helpers/browser-environment.cjs */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { prepareBrowser, finishSetup, agreeIfOffered, MODEL_URL } from './helpers/model-browser';

afterEach(cleanup);

it.each(['security', 'wildlife'])('%s waits for setup and explicit model agreement', async route => {
  const { network, getUserMedia } = prepareBrowser();
  const Page = require(`@/app/${route}/page`).default;
  const view = render(<Page />);
  await act(async () => {});
  expect(network.mock.calls.filter(([url]) => String(url) === MODEL_URL)).toHaveLength(0);
  expect(getUserMedia).not.toHaveBeenCalled();
  act(finishSetup);
  view.rerender(<Page />);
  await act(async () => {});
  expect(network.mock.calls.filter(([url]) => String(url) === MODEL_URL)).toHaveLength(0);
});

it('security cannot be armed until the detection model is ready', async () => {
  prepareBrowser();
  finishSetup();
  const store = require('@/stores/security-store').useSecurityStore;
  const Page = require('@/app/security/page').default;
  render(<Page />);
  await act(async () => {});
  // Armed with no model would show an armed system that watches nothing.
  fireEvent.click(screen.getByRole('button', { name: /arm system/i }));
  expect(store.getState().armingState).toBe('disarmed');

  await agreeIfOffered();
  await waitFor(() => expect(screen.getByText('AI: Ready')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /arm system/i }));
  expect(store.getState().armingState).not.toBe('disarmed');
});
