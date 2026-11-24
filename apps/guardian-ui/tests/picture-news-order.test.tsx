/** @jest-environment jsdom */
/**
 * News of the alert pictures choices from other tabs, in the order it is heard
 *
 * A choice heard from another tab holds here as this tab's own: a change of
 * another choice here keeps it, and news of an older choice, heard late,
 * changes nothing. News sent before a clear of all local data answers
 * nothing after it.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import type { TabMessage } from '@/lib/tab-channel';
import type { PictureNews } from '@/lib/alert-pictures/channel';
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

import { forgetAllPictures, holdPicture, noticeAnswered, picturesInNotifications, useKeptCount } from '@/lib/alert-pictures/keeper';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';

function Count() {
  useKeptCount();
  return null;
}

function hear(news: PictureNews) {
  act(() => {
    for (const listener of mockHeard) listener({ type: 'pictures', news });
  });
}

const ACCOUNT_MARKER = 'safeos_account_data_cleared';

beforeEach(() => {
  mockSave.mockClear();
  localStorage.setItem(ACCOUNT_MARKER, 'before-any-clear');
  // The keeper hears the other tabs once a card or a count shows.
  render(<Count />);
  expect(mockHeard.length).toBeGreaterThan(0);
});

it('news of an older choice, heard after a newer one, leaves the newer one standing', () => {
  const now = Date.now();
  act(() => useAlertPicturesStore.setState({ keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: true, chosenAt: now - 3_000 }));
  // Another tab turned the picture in notifications off; news of an earlier choice that had it on comes later.
  hear({ type: 'settings', keep: true, deleteAfterDays: 3, inNotifications: false, noticeAnswered: true, at: now - 1_000 });
  hear({ type: 'settings', keep: true, deleteAfterDays: 3, inNotifications: true, noticeAnswered: true, at: now - 2_000 });
  expect(picturesInNotifications()).toBe(false);
});

it('Keep alert pictures off heard from another tab holds when this tab then changes the age', async () => {
  const now = Date.now();
  act(() => useAlertPicturesStore.setState({ keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false, chosenAt: now - 3_000 }));
  hear({ type: 'settings', keep: false, deleteAfterDays: 3, inNotifications: false, noticeAnswered: true, at: now - 1_000 });
  // The person changes Delete pictures after here, before this tab reads the other tab's choice.
  act(() => useAlertPicturesStore.getState().setDeleteAfterDays(7));

  const set: PictureSet = {
    id: `picture-${now}-after-age`, kind: 'motion', takenAt: now, frame: new Blob(['frame']), frameWidth: 4, frameHeight: 3,
    box: null, sourceWidth: 4, sourceHeight: 3, sourceBox: null, closeUp: null, closeUpWidth: 0, closeUpHeight: 0, dark: false,
  };
  await act(async () => {
    holdPicture(Promise.resolve(set), set.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(mockSave).not.toHaveBeenCalled();
  expect(useAlertPicturesStore.getState().keep).toBe(false);
});

it('news sent before a clear of all local data does not answer the notice after it', () => {
  const sent = {
    type: 'settings' as const, keep: true, deleteAfterDays: 3 as const, inNotifications: false, noticeAnswered: true,
    at: Date.now(), cleared: 'before-any-clear',
  };
  // The clear writes a new account marker, and this tab lets go of every picture and of the answer.
  localStorage.setItem(ACCOUNT_MARKER, 'after-the-clear');
  act(() => {
    useAlertPicturesStore.getState().reset();
    forgetAllPictures();
  });
  hear(sent);
  expect(noticeAnswered()).toBe(false);
});
