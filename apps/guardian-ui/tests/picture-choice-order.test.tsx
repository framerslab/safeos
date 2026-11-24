/** @jest-environment jsdom */
/**
 * The order of the choices across tabs
 *
 * A choice made after this tab heard another tab's carries a later time,
 * even in the same millisecond, so every tab takes it as the newer one. The
 * news of a change carries "Show the picture in alert notifications" too, so
 * a tab whose browser does not hand it the saved choices in time follows it,
 * and the answer to the notice about alert pictures, so such a tab starts its
 * watch with no notice once another tab has answered it.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TabMessage } from '@/lib/tab-channel';

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
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  countKeptAlertPictures: jest.fn(async () => 0),
  goneExpiredAlertPictures: jest.fn(async () => []),
}));

import { picturesInNotifications, useKeptCount } from '@/lib/alert-pictures/keeper';
import { useNoticeGate } from '@/components/alert-pictures/PicturesNotice';
import { settingsNews } from '@/lib/alert-pictures/channel';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';

function Count() {
  useKeptCount();
  return null;
}

/** A start key that goes through the notice, as every start of a watch does. */
function Start({ onStart }: { onStart: () => void }) {
  const { askBeforeStart, notice } = useNoticeGate();
  return (
    <>
      <button type="button" onClick={() => askBeforeStart(onStart)}>Start</button>
      {notice}
    </>
  );
}

const T = 1_790_000_000_000;
const hear = (news: Record<string, unknown>) => act(() => {
  for (const listener of mockHeard) listener({ type: 'pictures', news } as unknown as TabMessage);
});

afterEach(() => jest.restoreAllMocks());

it('a choice made in the millisecond of a choice heard from another tab carries a later time', () => {
  jest.spyOn(Date, 'now').mockReturnValue(T);
  render(<Count />);
  // Another tab turns keeping on at T, and this tab hears it.
  hear({ type: 'settings', keep: true, deleteAfterDays: 3, at: T });
  // In the same millisecond, this tab turns keeping off: its choice is the later one.
  act(() => useAlertPicturesStore.getState().answerNotice({ keep: false, deleteAfterDays: 3 }));
  expect(useAlertPicturesStore.getState().chosenAt).toBeGreaterThan(T);
  expect(settingsNews(useAlertPicturesStore.getState())).toMatchObject({ keep: false });
});

it('the news of a change carries Show the picture in alert notifications, and a tab follows it', () => {
  jest.spyOn(Date, 'now').mockReturnValue(T + 10_000);
  render(<Count />);
  act(() => useAlertPicturesStore.getState().setInNotifications(true));
  expect(picturesInNotifications()).toBe(true);
  expect(settingsNews(useAlertPicturesStore.getState())).toMatchObject({ inNotifications: true });

  // Another tab turns the picture off later; this tab has not read the saved choice yet.
  hear({ type: 'settings', keep: true, deleteAfterDays: 3, inNotifications: false, at: T + 20_000 });
  expect(useAlertPicturesStore.getState().inNotifications).toBe(true);
  expect(picturesInNotifications()).toBe(false);
});

it('the news of an answered notice carries the answer, and a tab that hears it starts its watch with no notice', () => {
  jest.spyOn(Date, 'now').mockReturnValue(T + 40_000);
  // This tab holds no answer: its browser refuses to keep the choices, so it never reads one.
  act(() => useAlertPicturesStore.setState({ noticeAnswered: false }));
  const answered = { ...useAlertPicturesStore.getState(), noticeAnswered: true };
  expect(settingsNews(answered)).toMatchObject({ noticeAnswered: true });

  const started = jest.fn();
  render(<><Count /><Start onStart={started} /></>);
  // Another tab answers the notice, and this tab hears it.
  hear({ type: 'settings', keep: true, deleteAfterDays: 3, inNotifications: false, noticeAnswered: true, at: T + 50_000 });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(started).toHaveBeenCalledTimes(1);
});
