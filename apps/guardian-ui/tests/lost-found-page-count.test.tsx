/** @jest-environment jsdom */
/**
 * The Lost & Found page's count follows the pictures kept for each pet
 *
 * A pet's card counts the pictures this device keeps for it. When another
 * tab saves or deletes one while the page stays open, that tab says the
 * alerts changed, and the page reads the counts again. So it does when this
 * tab saves a picture that was on its way as its watch was left. Of reads that
 * overlap, the newest is the one shown. A pet this device cannot delete keeps
 * its card.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { postPictureNews } from '@/lib/alert-pictures/channel';
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
  deleteSubjectProfile: jest.fn(async () => ({ result: 'failed' })),
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

it('reads the counts again when this tab saves a picture after its watch was left', async () => {
  installTabChannel();
  mockCounts.mockReset().mockResolvedValueOnce({ mittens: 0 }).mockResolvedValue({ mittens: 1 });
  const { default: LostFoundPage } = await import('@/app/lost-found/page');

  render(<LostFoundPage />);
  expect(await screen.findByText(/^No possible sightings saved • Created /)).toBeTruthy();

  await act(async () => {
    postPictureNews({ type: 'saved', id: 'picture-1' });
  });

  expect(await screen.findByText(/^1 possible sighting saved • Created /)).toBeTruthy();
});

it.each([
  ['two changes', 1],
  ['the page opening and a change', 0],
])('shows the newest count when reads for %s overlap and the older one ends last', async (_what, settled) => {
  installTabChannel();
  const answers: Array<(counts: Record<string, number>) => void> = [];
  mockCounts.mockReset().mockImplementation(() => new Promise((resolve) => { answers.push(resolve); }));
  const { default: LostFoundPage } = await import('@/app/lost-found/page');

  render(<LostFoundPage />);
  await waitFor(() => expect(answers).toHaveLength(1));
  if (settled) await act(async () => { answers[0]({ mittens: 1 }); });
  for (let news = 1; news <= settled + 1; news++) {
    await act(async () => { postPictureNews({ type: 'saved', id: `picture-${news}` }); });
    await waitFor(() => expect(answers).toHaveLength(news + 1));
  }
  const [older, newer] = answers.slice(-2);
  await act(async () => { newer({ mittens: 3 }); });
  await act(async () => { older({ mittens: 2 }); });
  expect(await screen.findByText(/^3 possible sightings saved • Created /)).toBeTruthy();
});

it('keeps a pet’s card and says so when the pet could not be deleted', async () => {
  installTabChannel();
  mockCounts.mockReset().mockResolvedValue({ mittens: 1 });
  window.confirm = jest.fn(() => true);
  const { default: LostFoundPage } = await import('@/app/lost-found/page');

  render(<LostFoundPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Mittens' }));

  expect(await screen.findByText('Mittens could not be deleted on this device.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete Mittens' })).toBeTruthy();
});
