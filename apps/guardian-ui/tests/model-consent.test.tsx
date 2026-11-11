/** @jest-environment ./tests/helpers/browser-environment.cjs */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { prepareBrowser, finishSetup, MODEL_URL } from './helpers/model-browser';

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
