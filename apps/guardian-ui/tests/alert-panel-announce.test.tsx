/** @jest-environment jsdom */
/**
 * The alert panel's screen-reader announcement
 *
 * A repeat of a continuing event updates its card in place, often with the
 * same reading and severity. The announcement names the repeat count, so its
 * text changes with each repeat and a screen reader reads it, also for a
 * person who has turned system notifications off.
 */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Alert } from '@/stores/monitoring-store';
import { FakeAudioContext, resetFakeAudio, settle } from './helpers/fake-audio';

require('fake-indexeddb/auto');

beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while the sound module and stores are made afresh.
  jest.doMock('react', () => React);
  localStorage.clear();
  resetFakeAudio();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

/** The panel's announcement: its first polite status. The alert list's line about pictures is another. */
const announced = () => screen.getAllByRole('status')[0].textContent;

it('announces each repeat of a card, also a repeat with the same reading and severity', async () => {
  const { AlertPanel } = await import('@/components/AlertPanel');
  const card: Alert = {
    id: 'motion-card',
    streamId: 'camera',
    severity: 'high',
    message: 'Motion detected: 75% (threshold: 20%)',
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };
  const panel = (alert: Alert) => <AlertPanel alerts={[alert]} onAcknowledge={() => {}} />;

  const { rerender } = render(panel(card));
  await act(async () => { await settle(); });
  const first = announced();
  // A Motion alert is read by its kind, level and time, as this device writes a time; its numbers stay in its record.
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(new Date(card.createdAt ?? 0));
  const opening = `New alert: Motion, High, at ${time}`;
  expect(first?.slice(0, opening.length)).toBe(opening);
  expect(first).not.toContain('Motion detected');

  rerender(panel({ ...card, repeats: 1 }));
  await act(async () => { await settle(); });
  const second = announced();
  expect(second).not.toBe(first);
  expect(second).toContain('Repeated 1 time.');

  rerender(panel({ ...card, repeats: 2 }));
  await act(async () => { await settle(); });
  expect(announced()).toContain('Repeated 2 times.');
});
