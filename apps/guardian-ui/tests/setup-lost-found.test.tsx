/** @jest-environment jsdom */
/**
 * Lost & Found in setup
 *
 * Setup's question of what is being watched offers Lost & Found beside the
 * four uses. Lost & Found compares the camera's picture with a pet's photos,
 * so choosing it saves the pet use; setup's last key then reads "Open Lost
 * and Found" and opens the Lost & Found page, where the photos are added. The
 * other uses end on the dashboard as before.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SetupPage from '@/app/setup/page';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { installCameraBrowser } from './helpers/camera-browser';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  mockRouter.push.mockClear();
  installCameraBrowser();
  window.history.replaceState({}, '', '/setup/');
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

/** From the first step to the question of what is being watched. */
async function toTheQuestion() {
  render(<SetupPage />);
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  await act(async () => {});
}

/** From the camera step to the last step. */
async function toTheLastStep() {
  fireEvent.click(await screen.findByRole('button', { name: /Grant Permissions/ }));
  fireEvent.click(await screen.findByRole('button', { name: /^Continue$/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Skip & Continue/ }));
}

it('offers Lost & Found beside the four uses', async () => {
  await toTheQuestion();
  for (const choice of [/Pet Monitoring/, /Baby Monitoring/, /Elderly Care/, /Security Mode/, /Lost & Found/]) {
    expect(screen.getByRole('button', { name: choice })).toBeTruthy();
  }
});

it('saves the pet use for Lost & Found, and its last key opens the Lost & Found page', async () => {
  await toTheQuestion();
  fireEvent.click(screen.getByRole('button', { name: /Lost & Found/ }));
  await toTheLastStep();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Lost and Found' }));

  const saved = useOnboardingStore.getState();
  expect(saved.isComplete).toBe(true);
  expect(saved.selectedScenario).toBe('pet');
  // The one page opened is Lost & Found's: finishing setup forwards nowhere else.
  await act(async () => {});
  expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/lost-found/']);
});

it('says where to start the comparison: Start Monitoring on the Lost & Found page, then on Monitor', async () => {
  await toTheQuestion();
  fireEvent.click(screen.getByRole('button', { name: /Lost & Found/ }));
  await toTheLastStep();
  await screen.findByRole('button', { name: 'Open Lost and Found' });
  expect(screen.getByText(/add photos of your pet on the Lost & Found page and press its Start Monitoring\. On Monitor, press Start Monitoring to start the camera/)).toBeTruthy();
});

it('shows Lost & Found chosen, not Pet Monitoring, when the person goes back to the question', async () => {
  await toTheQuestion();
  fireEvent.click(screen.getByRole('button', { name: /Lost & Found/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Back/ }));

  expect(screen.getByRole('button', { name: /Lost & Found/ }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: /Pet Monitoring/ }).getAttribute('aria-pressed')).toBe('false');
});

it('ends on the dashboard for another use, as before', async () => {
  await toTheQuestion();
  fireEvent.click(screen.getByRole('button', { name: /Pet Monitoring/ }));
  await toTheLastStep();
  fireEvent.click(await screen.findByRole('button', { name: /Launch Dashboard/ }));

  expect(useOnboardingStore.getState().selectedScenario).toBe('pet');
  await act(async () => {});
  expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/dashboard']);
});

it('keeps Lost & Found chosen when the person runs setup again, and ends on its page again', async () => {
  await toTheQuestion();
  fireEvent.click(screen.getByRole('button', { name: /Lost & Found/ }));
  await toTheLastStep();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Lost and Found' }));
  await act(async () => {});

  // A later visit runs setup again from the home page.
  cleanup();
  mockRouter.push.mockClear();
  window.history.replaceState({}, '', '/setup/?again=1');
  render(<SetupPage />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: /Begin Setup/ }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Accept & Continue/ }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: /Lost & Found/ }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: /Pet Monitoring/ }).getAttribute('aria-pressed')).toBe('false');

  // Continue keeps the choice.
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  await toTheLastStep();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Lost and Found' }));
  await act(async () => {});
  expect(mockRouter.push.mock.calls.map(([to]) => to)).toEqual(['/lost-found/']);
});

it('says how to change the choice later: run setup again from the home page', async () => {
  await toTheQuestion();
  expect(screen.getByText(/To change it later, run setup again from the home page\./)).toBeTruthy();
  expect(screen.queryByText(/change this later in settings/i)).toBeNull();
});
