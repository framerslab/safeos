/** @jest-environment jsdom */
/**
 * The Lost & Found page's count follows the pictures kept for each pet
 *
 * A pet's card counts the pictures this device keeps for it. When another
 * tab saves or deletes one while the page stays open, that tab says the
 * alerts changed, and the page reads the counts again.
 */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { installTabChannel } from './helpers/tab-channel-stand-in';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const mockCounts = jest.fn();
jest.mock('@/lib/client-db', () => ({
  getAllSubjectProfiles: jest.fn(async () => [
    {
      id: 'mittens',
      name: 'Mittens',
      type: 'pet',
      description: '',
      fingerprint: {},
      referenceImages: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      lastActiveAt: null,
      matchCount: 1,
    },
  ]),
  countMatchFramesBySubject: (...args: unknown[]) => mockCounts(...args),
  deleteSubjectProfile: jest.fn(async () => undefined),
  saveSubjectProfile: jest.fn(async () => undefined),
}));

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
});

it('reads the counts again when another tab deletes a saved picture', async () => {
  const other = installTabChannel().otherTab();
  mockCounts.mockResolvedValueOnce({ mittens: 1 }).mockResolvedValue({ mittens: 0 });
  const { default: LostFoundPage } = await import('@/app/lost-found/page');

  render(<LostFoundPage />);
  expect(await screen.findByText(/^1 possible sighting saved • Created /)).toBeTruthy();

  await act(async () => {
    other.say({ type: 'alerts-changed' });
  });

  expect(await screen.findByText(/^No possible sightings saved • Created /)).toBeTruthy();
});
