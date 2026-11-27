/** @jest-environment node */
/**
 * Setup's route as it is served
 *
 * Before the page's script runs, /setup/ is step 1 whole: Back to the home
 * page, the step's glyph, the heading and the lead, the camera's key in its
 * frame with the line under it, Continue without the camera, the statement,
 * where the picture goes, and the line that asks for script. Nothing of the
 * six steps it replaced is served.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SetupPage from '@/app/setup/page';
import { bare, served, words } from './helpers/served-html';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { apiUrl: '', wsUrl: '', ollamaUrl: '', configured: false } }),
}));
jest.mock('@/lib/short-lived-storage', () => ({
  ...jest.requireActual('@/lib/short-lived-storage'),
  useStorageEnds: jest.fn(() => false),
}));

const LEAD =
  "SafeOS watches with the camera and microphone and sounds an alert here when something moves, makes a sound or, for a lost pet, when its colours come into view.";
const LINE = 'Your browser will ask you to allow the camera and microphone.';
const STATEMENT =
  'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';

it('serves step 1 whole before script', () => {
  const html = renderToStaticMarkup(<SetupPage />);
  const doc = served(html);
  const mains = doc.querySelectorAll('main.setup');
  expect(mains).toHaveLength(1);
  const main = mains[0];
  expect(main.getAttribute('data-step')).toBe('1');
  const back = main.querySelector('.setup-back-row a');
  expect(words(back)).toBe('Back');
  expect(bare(back?.getAttribute('href'))).toBe('/');
  expect(main.querySelector('.setup-back-row svg[role="img"]')?.getAttribute('aria-label')).toBe('Step 1 of 2');
  const headings = main.querySelectorAll('h1');
  expect(headings).toHaveLength(1);
  expect(words(headings[0])).toBe('Use this device to watch a place');
  expect(words(main.querySelector('.setup-lead'))).toBe(LEAD);
  const buttons = Array.from(main.querySelectorAll('button'), (button) => words(button));
  expect(buttons).toContain('Turn on the camera');
  expect(buttons).toContain('Continue without the camera');
  expect(words(main.querySelector('#setup-frame-line'))).toBe(LINE);
  expect(words(main.querySelector('.setup-statement'))).toBe(STATEMENT);
  expect(words(main.querySelector('.setup-picture-line'))).toBe('The picture stays on this device.');
  expect(main.querySelector('#setup-needs-script')).not.toBeNull();
  expect(html).not.toContain('opacity-0');
  for (const old of ['System Setup', 'Step 1 of 6', 'Begin Setup', 'Skip to main content']) {
    expect(html.split(old)).toHaveLength(1);
  }
});
