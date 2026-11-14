/** @jest-environment jsdom */
/**
 * Lost & Found offers pets and things, and keeps showing saved people
 *
 * The matcher compares colours, a coarse edge grid and size; it is never
 * offered for finding a person, so the wizard's type step has no Person
 * choice. A subject saved with the person type by an earlier version is
 * still stored with that type (client-db's SubjectProfileDB) and still
 * listed on the page with its label.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LostFoundPage from '@/app/lost-found/page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/lib/client-db', () => ({
  getAllSubjectProfiles: jest.fn(async () => [
    {
      id: 'saved-person',
      name: 'Sam',
      type: 'person',
      description: 'Saved before the person choice left the wizard',
      fingerprint: {},
      referenceImages: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      lastActiveAt: '2026-10-01T00:00:00.000Z',
      matchCount: 2,
    },
  ]),
  deleteSubjectProfile: jest.fn(async () => undefined),
  saveSubjectProfile: jest.fn(async () => undefined),
}));

it('lists a subject saved with the person type, with its label', async () => {
  render(<LostFoundPage />);
  expect(await screen.findByText('Sam')).toBeTruthy();
  expect(screen.getAllByText('Person').length).toBeGreaterThan(0);
});

it('offers no Person choice when a subject is added', async () => {
  render(<LostFoundPage />);
  fireEvent.click(await screen.findByText('Add New Subject to Watch'));
  expect(await screen.findByText('What are you looking for?')).toBeTruthy();
  expect(screen.getAllByText('Pet').length).toBeGreaterThan(0);
  expect(screen.queryByText('Person')).toBeNull();
  expect(screen.queryByText(/Family member or friend/)).toBeNull();
});
