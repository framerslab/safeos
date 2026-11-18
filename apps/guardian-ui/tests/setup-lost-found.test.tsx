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
  expect(mockRouter.push).toHaveBeenCalledWith('/lost-found/');
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
  expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
});
