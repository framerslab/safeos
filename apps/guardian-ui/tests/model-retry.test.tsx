/** @jest-environment ./tests/helpers/browser-environment.cjs */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { prepareBrowser, finishSetup, agreeIfOffered, MODEL_URL } from './helpers/model-browser';

afterEach(cleanup);

it.each(['security', 'wildlife'])('%s retries after a failed download and route return', async route => {
  const { network } = prepareBrowser();
  finishSetup();
  const onlineFetch = network.getMockImplementation()!;
  network.mockImplementation(async () => { throw new Error('Offline'); });
  const Page = require(`@/app/${route}/page`).default;
  const first = render(<Page />);
  await agreeIfOffered();
  await waitFor(() => expect(screen.getByText('AI: Error')).toBeTruthy());
  first.unmount();
  network.mockImplementation(onlineFetch);
  render(<Page />);
  await agreeIfOffered();
  await waitFor(() => expect(screen.getByText('AI: Ready')).toBeTruthy());
  expect(network.mock.calls.filter(([url]) => String(url) === MODEL_URL).length).toBeGreaterThanOrEqual(2);
});
