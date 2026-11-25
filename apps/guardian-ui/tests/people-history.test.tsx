/** @jest-environment jsdom */
/**
 * People history: the pictures a People watch saved
 *
 * Each picture says how many people were in view and whether that is more
 * than its watch allows, with no score and no word for who they are, on the
 * list, in the opened picture and in the question before one is deleted.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntrusionGallery } from '@/components/IntrusionGallery';
import { timeWords } from '@/lib/alert-pictures/words';
import { deleteIntrusionFrame, getAllIntrusionFrames, getIntrusionStats } from '@/lib/client-db';
import { barredWording, homeWordingInputs } from '../scripts/home-wording.cjs';

jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  getAllIntrusionFrames: jest.fn(),
  getIntrusionStats: jest.fn(),
  deleteIntrusionFrame: jest.fn(),
}));

const AT = new Date('2026-11-18T21:42:40Z').getTime();
const PICTURE = 'data:image/png;base64,iVBORw0KGgo=';

const frame = (id: string, personCount: number) => ({
  id,
  frameData: PICTURE,
  thumbnailData: PICTURE,
  timestamp: AT,
  personCount,
  allowedCount: 1,
  detections: [{ bbox: [0, 0, 40, 40] as [number, number, number, number], confidence: 0.82 }],
  acknowledged: false,
  notes: '',
  exported: false,
});

async function openGallery() {
  jest.mocked(getAllIntrusionFrames).mockResolvedValue([frame('two', 2), frame('one', 1)]);
  jest.mocked(getIntrusionStats).mockResolvedValue({ totalIntrusions: 2, unacknowledged: 2, last24Hours: 2, last7Days: 2, averagePersonCount: 1.5 });
  const view = render(<IntrusionGallery />);
  await screen.findByAltText(`2 people in view at ${timeWords(AT)}`);
  return view;
}

const plain = (root: Element) => {
  for (const text of homeWordingInputs(root)) {
    expect(text).not.toMatch(barredWording);
    expect(text).not.toMatch(/intrusion|unauthorized/i);
  }
};

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it('gives each picture its count, its time and whether that is more than the watch allows', async () => {
  const { container } = await openGallery();
  expect(screen.getByAltText(`2 people in view at ${timeWords(AT)}`)).toBeTruthy();
  expect(screen.getByAltText(`1 person in view at ${timeWords(AT)}`)).toBeTruthy();
  expect(screen.getAllByText('More than this watch allows.')).toHaveLength(1);
  plain(container);
});

it('opens a picture with its count and no score on its boxes', async () => {
  const { container } = await openGallery();
  fireEvent.click(screen.getByAltText(`2 people in view at ${timeWords(AT)}`));
  expect(screen.getByRole('heading', { name: '2 people in view' })).toBeTruthy();
  plain(container);
});

it('asks before it deletes a picture, or the pictures chosen, in the same words', async () => {
  const { container } = await openGallery();
  const asked = jest.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
  expect(asked).toHaveBeenLastCalledWith('Delete this picture?');

  const choose = Array.from(container.querySelectorAll('.bottom-2.left-2'));
  fireEvent.click(choose[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));
  expect(asked).toHaveBeenLastCalledWith('Delete 1 picture?');
  fireEvent.click(choose[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));
  expect(asked).toHaveBeenLastCalledWith('Delete 2 pictures?');
  expect(deleteIntrusionFrame).not.toHaveBeenCalled();
});
