/** @jest-environment ./tests/helpers/browser-environment.cjs */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { prepareBrowser, finishSetup } from './helpers/model-browser';

afterEach(cleanup);

it('shows an actionable browser model download in Models settings', async () => {
  prepareBrowser();
  finishSetup();
  const Page = require('@/app/settings/models/page').default;
  render(<Page />);
  expect(await screen.findByRole('button', { name: /download.*model/i })).toBeTruthy();
});
