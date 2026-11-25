/** @jest-environment jsdom */
/**
 * The gallery tells an empty filter from an empty gallery
 *
 * With no saved picture the gallery says so. With saved pictures that the
 * chosen filter leaves out, it says the filter shows none and keeps the
 * pictures' existence plain, so nobody reads them as deleted.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MatchGallery } from '@/components/MatchGallery';

const PICTURE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const mockFrames = jest.fn();

jest.mock('@/lib/client-db', () => ({
  getSavedSightingPictures: () => mockFrames(),
  getAllSubjectProfiles: jest.fn(async () => []),
  acknowledgeMatchFrame: jest.fn(async () => undefined),
  deleteMatchFrame: jest.fn(async () => undefined),
  markMatchFramesExported: jest.fn(async () => undefined),
  exportMatchFrames: jest.fn(async () => ''),
}));

afterEach(cleanup);

it('says no picture is saved when the gallery is empty', async () => {
  mockFrames.mockResolvedValue([]);
  render(<MatchGallery />);
  expect(await screen.findByText('No pictures saved')).toBeTruthy();
});

it('says the filter shows none when saved pictures are left out by it', async () => {
  mockFrames.mockResolvedValue([
    {
      id: 'picture-1', subjectId: 'mittens', frameData: PICTURE, thumbnailData: PICTURE, confidence: 80,
      timestamp: Date.now(), details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
      region: null, acknowledged: false, notes: '', exported: false, alerted: true,
    },
  ]);
  render(<MatchGallery />);
  expect(await screen.findByRole('img', { name: /^What the camera saw at / })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Exported' }));

  expect(await screen.findByText('None of the saved pictures fit this filter')).toBeTruthy();
  expect(screen.queryByText('No pictures saved')).toBeNull();
});
