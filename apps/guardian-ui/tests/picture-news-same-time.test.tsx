/** @jest-environment jsdom */
import React from 'react';
import { act, render } from '@testing-library/react';
import type { TabMessage } from '@/lib/tab-channel';
import type { PictureSet } from '@/lib/alert-pictures/capture';

// The other tabs' news reaches the keeper through this list; nothing goes out.
const mockHeard: Array<(message: TabMessage) => void> = [];
jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  onTabMessage: (listener: (message: TabMessage) => void) => {
    mockHeard.push(listener);
    return () => undefined;
  },
  tellTabs: jest.fn(),
}));
const mockSave = jest.fn(async () => ({ result: 'saved' as const, deleted: [] as string[] }));
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  saveAlertPicture: () => mockSave(),
  countKeptAlertPictures: jest.fn(async () => 0),
  goneExpiredAlertPictures: jest.fn(async () => []),
}));

import { holdPicture, useKeptCount } from '@/lib/alert-pictures/keeper';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';

function Count() {
  useKeptCount();
  return null;
}

afterEach(() => jest.restoreAllMocks());

it('news of a choice another tab made in the same millisecond as this tab\'s own leaves this tab\'s choice standing', async () => {
  const T = 1_790_000_000_000;
  jest.spyOn(Date, 'now').mockReturnValue(T);
  // The keeper hears the other tabs once a card or a count shows.
  render(<Count />);
  expect(mockHeard.length).toBeGreaterThan(0);

  // This tab turns keeping off.
  act(() => useAlertPicturesStore.getState().answerNotice({ keep: false, deleteAfterDays: 3 }));
  expect(useAlertPicturesStore.getState().chosenAt).toBe(T);

  // Another tab's Keep alert pictures on, chosen in the same millisecond, is heard after it.
  act(() => {
    for (const hear of mockHeard) hear({ type: 'pictures', news: { type: 'settings', keep: true, deleteAfterDays: 3, at: T } });
  });

  // The next alert's picture is not saved: keeping is off here.
  const set: PictureSet = {
    id: `picture-${T}-same`, kind: 'motion', takenAt: T, frame: new Blob(['frame']), frameWidth: 4, frameHeight: 3,
    box: null, sourceWidth: 4, sourceHeight: 3, sourceBox: null, closeUp: null, closeUpWidth: 0, closeUpHeight: 0, dark: false,
  };
  await act(async () => {
    holdPicture(Promise.resolve(set), set.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(mockSave).not.toHaveBeenCalled();
});
