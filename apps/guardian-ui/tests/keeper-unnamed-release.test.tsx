/** @jest-environment jsdom */
/**
 * A picture a repeat replaced is let go after the watch stops
 *
 * A repeat puts a newer picture on its card, and the earlier one is named
 * by no alert. Once no card shows it, its URLs are revoked two minutes
 * later, though no picture is taken after it: the watch may have stopped.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import type { PictureSet } from '@/lib/alert-pictures/capture';
import type { Alert } from '@/stores/monitoring-store';

jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  tellTabs: jest.fn(),
}));
jest.mock('@/lib/client-db', () => ({
  ...jest.requireActual('@/lib/client-db'),
  saveAlertPicture: jest.fn(async () => ({ result: 'saved', deleted: [] })),
  countKeptAlertPictures: jest.fn(async () => 0),
  getAlertPicture: jest.fn(async () => null),
}));

import { holdPicture, usePicture } from '@/lib/alert-pictures/keeper';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useAlertPicturesStore } from '@/stores/alert-pictures-store';

const AT = Date.UTC(2026, 10, 22, 21, 42, 40);

const setOf = (id: string): PictureSet => ({
  id, kind: 'motion', takenAt: AT, frame: new Blob([id]), frameWidth: 4, frameHeight: 3,
  box: null, sourceWidth: 4, sourceHeight: 3, sourceBox: null, closeUp: null, closeUpWidth: 0, closeUpHeight: 0, dark: false,
});

const card = (pictureId: string) => ({
  id: `motion-${AT}-card`, streamId: 'local', severity: 'medium', message: 'Motion', acknowledged: false,
  monitoring: true, kind: 'motion', createdAt: new Date(AT).toISOString(), timestamp: new Date(AT).toISOString(), pictureId,
}) as unknown as Alert;

function Card({ pictureId }: { pictureId: string }) {
  const view = usePicture(pictureId);
  return <p>{view.status}</p>;
}

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

it('revokes the URLs of a picture a repeat replaced two minutes after no card shows it, with no picture taken after', async () => {
  jest.useFakeTimers();
  const revoked: string[] = [];
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => `blob:made-${++made}`) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn((url: string) => { revoked.push(url); }) });
  useAlertPicturesStore.setState({ noticeAnswered: true, keep: true });

  // The event's first alert: its picture is kept and shown on its card.
  useMonitoringStore.setState({ alerts: [card('picture-a')] });
  holdPicture(Promise.resolve(setOf('picture-a')), 'picture-a');
  const view = render(<Card pictureId="picture-a" />);
  await settle();
  expect(view.container.textContent).toBe('shown');
  const first = 'blob:made-1';

  // A repeat: a newer picture, and the card shows it in place of the first.
  holdPicture(Promise.resolve(setOf('picture-b')), 'picture-b');
  useMonitoringStore.setState({ alerts: [card('picture-b')] });
  view.rerender(<Card pictureId="picture-b" />);
  await settle();

  // The watch stops: no picture is taken after. Two minutes on, the first picture is let go.
  act(() => { jest.advanceTimersByTime(130_000); });
  await settle();
  expect(revoked).toContain(first);
  expect(revoked).not.toContain('blob:made-2');
  jest.useRealTimers();
});
